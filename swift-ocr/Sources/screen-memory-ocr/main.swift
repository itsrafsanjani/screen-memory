import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: screen-memory-ocr <image-path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let imageURL = URL(fileURLWithPath: imagePath)

guard FileManager.default.fileExists(atPath: imagePath) else {
    fputs("Error: File not found: \(imagePath)\n", stderr)
    exit(1)
}

guard let image = NSImage(contentsOf: imageURL),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Error: Could not load image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([request])
} catch {
    fputs("Error: \(error.localizedDescription)\n", stderr)
    exit(1)
}

guard let observations = request.results else {
    let output: [String: Any] = ["text": "", "confidence": 0]
    if let data = try? JSONSerialization.data(withJSONObject: output),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(0)
}

var allText = ""
var totalConfidence: Float = 0
var count: Float = 0

for observation in observations {
    if let candidate = observation.topCandidates(1).first {
        allText += candidate.string + "\n"
        totalConfidence += candidate.confidence
        count += 1
    }
}

let avgConfidence = count > 0 ? totalConfidence / count : 0

let output: [String: Any] = [
    "text": allText.trimmingCharacters(in: .whitespacesAndNewlines),
    "confidence": Double(avgConfidence)
]

if let data = try? JSONSerialization.data(withJSONObject: output),
   let str = String(data: data, encoding: .utf8) {
    print(str)
}
