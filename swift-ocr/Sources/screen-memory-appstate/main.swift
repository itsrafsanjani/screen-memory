import AppKit
import CoreGraphics
import Foundation

let minWindowSide: CGFloat = 40

let fullscreenCoverage = 0.995

let ownPid = ProcessInfo.processInfo.processIdentifier

final class FrontmostTracker {
    private var current: NSRunningApplication?

    init() {
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

    func active() -> NSRunningApplication? {
        guard let app = current, !app.isTerminated else { return nil }
        return app
    }
}

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

let minDisplayShare = 0.02

func statePayload() -> [String: Any] {
    let windows = onScreenWindows()

    var displays: [[String: Any]] = []

    for id in activeDisplays() {
        let bounds = CGDisplayBounds(id)
        let displayArea = Double(bounds.width * bounds.height)
        guard displayArea > 0 else { continue }

        var entry: [String: Any] = ["displayId": String(id)]

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
    exit(0)
}
stdinReader.start()

let keepAlive = Timer(timeInterval: 3600, repeats: true) { _ in }
RunLoop.main.add(keepAlive, forMode: .default)

CFRunLoopRun()
