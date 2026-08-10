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
    guard let front = NSWorkspace.shared.frontmostApplication,
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

/// The display a window predominantly occupies, or nil if it touches none.
///
/// Any intersection at all used to be enough to call a window a display's
/// frontmost one. A window spilling a few pixels onto the neighbouring screen
/// would therefore be reported as *that* screen's dominant app and mask the app
/// actually filling it — silently disabling exclusion on a monitor. Assigning
/// each window to a single home display makes the spill-over case fall through
/// to the window that really is in front there.
func homeDisplay(for rect: CGRect, among displays: [(id: CGDirectDisplayID, rect: CGRect)])
    -> CGDirectDisplayID?
{
    var best: (id: CGDirectDisplayID, area: CGFloat)?
    for display in displays {
        let area = overlapArea(rect, display.rect)
        guard area > 0 else { continue }
        if best == nil || area > best!.area { best = (display.id, area) }
    }
    return best?.id
}

func statePayload() -> [String: Any] {
    let windows = onScreenWindows()
    let activeList = activeDisplays().map { (id: $0, rect: CGDisplayBounds($0)) }
    // Computed once for all displays: with N displays and M windows this is the
    // difference between N*M and M passes.
    let homes = windows.map { homeDisplay(for: $0.rect, among: activeList) }

    var displays: [[String: Any]] = []

    for display in activeList {
        let displayArea = display.rect.width * display.rect.height
        guard displayArea > 0 else { continue }

        var entry: [String: Any] = ["displayId": String(display.id)]

        // Only the frontmost window whose home is this display is considered. If
        // its owner can't be identified we report the display with no dominant
        // app rather than falling through to the window behind it — reporting a
        // covered-up app as dominant would exclude a screen the user can see.
        if let front = windows.indices.first(where: { homes[$0] == display.id }),
           let info = appInfo(for: windows[front].pid) {
            let area = overlapArea(windows[front].rect, display.rect)
            let coverage = min(max(Double(area / displayArea), 0), 1)
            entry["bundleId"] = info.bundleId
            entry["name"] = info.name
            entry["coverage"] = coverage
            entry["isFullscreen"] = coverage >= fullscreenCoverage
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
// the app always drives the stdin loop below.
let argv = Array(CommandLine.arguments.dropFirst())
if !argv.isEmpty {
    handle(argv.joined(separator: " "))
    exit(0)
}

while let line = readLine(strippingNewline: true) {
    handle(line)
}
