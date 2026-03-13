// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "screen-memory-ocr",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "screen-memory-ocr",
            path: "Sources"
        )
    ]
)
