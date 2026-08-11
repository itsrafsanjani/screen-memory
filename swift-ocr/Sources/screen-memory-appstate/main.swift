import AppKit
import CoreGraphics
import Foundation

// A long-lived helper that answers one JSON line per command read from stdin.
// The Electron main process keeps a single instance alive because usage
// tracking polls every couple of seconds; spawning a process per poll would be
// wasteful. Commands: `state`, `apps`, `bundle <path.app>`.
//
// Deliberately never reads kCGWindowName: that key requires Screen Recording
// permission, and everything here must keep working when the user has revoked
// it (usage tracking is independent of capture).

/// Windows smaller than this on either side are treated as tooltips or panels
/// rather than something that can plausibly dominate a display.
let minWindowSide: CGFloat = 40

/// Coverage at or above which a window is reported as true native fullscreen.
/// Informational only — the skip decision lives in the main process, which
/// compares `coverage` against a user-configurable threshold.
let fullscreenCoverage = 0.995

let ownPid = ProcessInfo.processInfo.processIdentifier

/// Tracks the active application across the life of the process.
///
/// `NSWorkspace.shared.frontmostApplication` reads a snapshot AppKit refreshes
/// from workspace notifications delivered on the run loop. This helper used to
/// block its only thread in `readLine()`, so nothing was ever delivered and the
/// property stayed pinned to whatever was in front when the helper spawned —
/// which is Screen Memory itself, since it shows a window just before starting
/// the helper. Every usage poll then saw the app's own window and recorded
/// nothing at all.
///
/// The notification is read directly rather than by re-reading the property, so
/// this stays correct without depending on when AppKit refreshes its cache. It
/// only works because the process now runs a run loop; see the bottom of the
/// file.
final class FrontmostTracker {
    private var current: NSRunningApplication?

    init() {
        // A one-shot invocation answers and exits before any notification could
        // arrive, so the seed is the only value it ever has — and in a fresh
        // process the property is accurate.
        current = NSWorkspace.shared.frontmostApplication

        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard
                let app = note.userInfo?[NSWorkspace.applicationUserInfoKey]
                    as? NSRunningApplication
            else { return }
            self?.current = app
        }
    }

    /// Nil once the tracked app has quit and nothing else has taken focus yet.
    /// Reporting a dead app would credit its usage segment with time the user
    /// spent elsewhere.
    func active() -> NSRunningApplication? {
        guard let app = current, !app.isTerminated else { return nil }
        return app
    }
}

/// Initialized here, before anything can call `frontmostPayload()`: top-level
/// statements in main.swift run in source order.
let frontmost = FrontmostTracker()

struct AppInfo {
    let bundleId: String
    let name: String
}

struct WindowRect {
    let pid: pid_t
    let rect: CGRect
}

func appInfo(for pid: pid_t) -> AppInfo? {
    guard let running = NSRunningApplication(processIdentifier: pid),
          let bundleId = running.bundleIdentifier else { return nil }
    return AppInfo(bundleId: bundleId, name: running.localizedName ?? bundleId)
}

/// On-screen, normal-layer windows in front-to-back order — the order
/// CGWindowListCopyWindowInfo returns, which is what makes "first window
/// intersecting this display" mean "frontmost window on this display".
func onScreenWindows() -> [WindowRect] {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return []
    }

    var out: [WindowRect] = []
    for entry in raw {
        guard let layer = entry[kCGWindowLayer as String] as? Int, layer == 0 else { continue }
        if let alpha = entry[kCGWindowAlpha as String] as? Double, alpha <= 0 { continue }

        guard let rawPid = entry[kCGWindowOwnerPID as String] as? Int else { continue }
        let pid = pid_t(rawPid)
        if pid == ownPid { continue }

        guard let boundsDict = entry[kCGWindowBounds as String] as? NSDictionary,
              let rect = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) else { continue }
        if rect.width < minWindowSide || rect.height < minWindowSide { continue }

        out.append(WindowRect(pid: pid, rect: rect))
    }
    return out
}

func activeDisplays() -> [CGDirectDisplayID] {
    var count: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &count) == .success, count > 0 else { return [] }
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    guard CGGetActiveDisplayList(count, &ids, &count) == .success else { return [] }
    return Array(ids.prefix(Int(count)))
}

func frontmostPayload() -> [String: Any]? {
    guard let front = frontmost.active(),
          let bundleId = front.bundleIdentifier else { return nil }
    return [
        "bundleId": bundleId,
        "name": front.localizedName ?? bundleId,
        "pid": Int(front.processIdentifier)
    ]
}

func overlapArea(_ a: CGRect, _ b: CGRect) -> CGFloat {
    let overlap = a.intersection(b)
    guard !overlap.isNull, !overlap.isEmpty else { return 0 }
    return overlap.width * overlap.height
}

/// The share of a display a window has to occupy before it can be called that
/// display's frontmost window.
///
/// Any intersection at all used to be enough, so a window spilling a few pixels
/// onto the neighbouring screen was reported as *that* screen's dominant app and
/// masked the app actually filling it — silently disabling exclusion on a
/// monitor. A floor rather than assigning each window to the one display it
/// mostly occupies: a window can legitimately fill two displays at once, and
/// picking a single winner would leave the other reporting no app at all, which
/// reads downstream as "nothing to exclude here".
let minDisplayShare = 0.02

func statePayload() -> [String: Any] {
    let windows = onScreenWindows()

    var displays: [[String: Any]] = []

    for id in activeDisplays() {
        let bounds = CGDisplayBounds(id)
        let displayArea = Double(bounds.width * bounds.height)
        guard displayArea > 0 else { continue }

        var entry: [String: Any] = ["displayId": String(id)]

        // Front-to-back, so the first window meaningfully present here is the
        // one in front here. If its owner can't be identified we report the
        // display with no dominant app rather than falling through to the window
        // behind it — reporting a covered-up app as dominant would exclude a
        // screen the user can see.
        for window in windows {
            let share = Double(overlapArea(window.rect, bounds)) / displayArea
            guard share >= minDisplayShare else { continue }
            guard let info = appInfo(for: window.pid) else { break }
            entry["bundleId"] = info.bundleId
            entry["name"] = info.name
            entry["coverage"] = min(share, 1)
            entry["isFullscreen"] = share >= fullscreenCoverage
            break
        }

        displays.append(entry)
    }

    var payload: [String: Any] = ["displays": displays]
    if let frontmost = frontmostPayload() {
        payload["frontmost"] = frontmost
    }
    return payload
}

func runningAppsPayload() -> [[String: String]] {
    var seen = Set<String>()
    var out: [[String: String]] = []

    for app in NSWorkspace.shared.runningApplications {
        // .regular skips background daemons and menu-bar-only agents, leaving
        // the apps a user would recognise in the Dock.
        guard app.activationPolicy == .regular,
              let bundleId = app.bundleIdentifier,
              app.processIdentifier != ownPid,
              !seen.contains(bundleId) else { continue }
        seen.insert(bundleId)
        out.append(["bundleId": bundleId, "name": app.localizedName ?? bundleId])
    }

    return out.sorted {
        ($0["name"] ?? "").localizedCaseInsensitiveCompare($1["name"] ?? "") == .orderedAscending
    }
}

func bundlePayload(path: String) -> [String: Any] {
    guard let bundle = Bundle(path: path), let bundleId = bundle.bundleIdentifier else {
        return ["error": "Could not read a bundle identifier at \(path)"]
    }
    let name = (bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
        ?? (bundle.object(forInfoDictionaryKey: "CFBundleName") as? String)
        ?? URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
    return ["bundleId": bundleId, "name": name]
}

func emit(_ payload: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: payload),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    } else {
        print("{\"error\":\"Failed to serialize response\"}")
    }
    // The parent reads line-by-line off a pipe, so nothing may sit in the buffer.
    fflush(stdout)
}

func handle(_ line: String) {
    let command = line.trimmingCharacters(in: .whitespacesAndNewlines)
    if command.isEmpty { return }

    if command == "state" {
        emit(statePayload())
    } else if command == "apps" {
        emit(["apps": runningAppsPayload()])
    } else if command.hasPrefix("bundle ") {
        emit(bundlePayload(path: String(command.dropFirst("bundle ".count))))
    } else {
        emit(["error": "Unknown command: \(command)"])
    }
}

// One-shot mode (`screen-memory-appstate state`) purely for debugging by hand;
// the app always drives the stdin loop below. Answers from the seeded tracker
// and exits without ever entering the run loop.
let argv = Array(CommandLine.arguments.dropFirst())
if !argv.isEmpty {
    handle(argv.joined(separator: " "))
    exit(0)
}

// stdin is read on its own thread so the main thread can run its run loop. That
// run loop is what delivers the workspace notifications FrontmostTracker needs;
// blocking the main thread here is what made this helper report a frozen
// frontmost app for its entire life.
//
// Commands are handled back on main: it serializes them against the notification
// observer, which touches the same state, and keeps replies in request order —
// the parent matches each reply to the request it has in flight, so reordering
// would mismatch them.
let stdinReader = Thread {
    while let line = readLine(strippingNewline: true) {
        DispatchQueue.main.sync { handle(line) }
    }
    // The parent closed the pipe. Nothing more can arrive, and the run loop
    // would otherwise keep this process alive forever.
    exit(0)
}
stdinReader.start()

// CFRunLoopRun() returns as soon as its run loop has no input sources left, and
// returning here would run off the end of main.swift and exit — the helper would
// die the instant it started, and the parent would respawn it forever. The
// workspace observer installs a source, but nothing in this file guarantees that,
// so an idle timer anchors the run loop explicitly.
//
// If it returns anyway the process exits, which the parent sees and recovers from
// with its respawn backoff. Deliberately not a `while true` retry: that would
// spin the CPU at 100% forever on a run loop that has nothing to service, which
// is a far quieter failure than exiting.
let keepAlive = Timer(timeInterval: 3600, repeats: true) { _ in }
RunLoop.main.add(keepAlive, forMode: .default)

CFRunLoopRun()
