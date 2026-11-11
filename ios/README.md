# ChaoticReview for iOS

Minimal native SwiftUI prototype: Working Copy diff import and local playbooks. It deliberately has no AI chat, Codex execution, or branch picker.

iOS apps cannot run `git` against arbitrary repository folders. Export a diff from Working Copy (or `git diff --no-color`) and open it with **Import diff**.

Open `ChaoticReviewApp.swift` in a new Xcode iOS App project (iOS 17+, SwiftUI), replacing the generated app source. No dependencies are required.
