// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "screen-memory-helpers",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "screen-memory-ocr"),
        .executableTarget(name: "screen-memory-appstate")
    ]
)
