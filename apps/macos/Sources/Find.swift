// Find in the page, as a browser's ⌘F: a bar above the web view over WebKit's own find, which searches the page's
// text and the frames inside it, wraps around, and says only whether there is a match, never how many.

import AppKit
import WebKit

/** The find bar: a search field, previous and next, and whether the last search matched. Enter finds the next match, ⇧Enter the previous, Esc closes it. */
final class FindBar: NSVisualEffectView, NSSearchFieldDelegate {
  let field = NSSearchField()
  private let status = NSTextField(labelWithString: "")
  private weak var web: WKWebView?
  private let close: () -> Void

  init(web: WKWebView, close: @escaping () -> Void) {
    self.web = web
    self.close = close
    super.init(frame: .zero)
    material = .titlebar
    blendingMode = .withinWindow

    field.placeholderString = "Find in page"
    field.sendsWholeSearchString = true
    field.delegate = self
    field.target = self
    field.action = #selector(nextMatch)
    field.widthAnchor.constraint(equalToConstant: 260).isActive = true

    let back = NSButton(image: NSImage(systemSymbolName: "chevron.left", accessibilityDescription: "Previous match")!, target: self, action: #selector(previousMatch))
    let forward = NSButton(image: NSImage(systemSymbolName: "chevron.right", accessibilityDescription: "Next match")!, target: self, action: #selector(nextMatch))
    let finish = NSButton(title: "Done", target: self, action: #selector(done))
    [back, forward, finish].forEach { $0.bezelStyle = .accessoryBarAction }
    status.textColor = .secondaryLabelColor

    let row = NSStackView(views: [status, field, back, forward, finish])
    row.orientation = .horizontal
    row.spacing = 6
    row.translatesAutoresizingMaskIntoConstraints = false
    let line = NSBox()
    line.boxType = .separator
    line.translatesAutoresizingMaskIntoConstraints = false
    addSubview(row)
    addSubview(line)
    NSLayoutConstraint.activate([
      heightAnchor.constraint(equalToConstant: 34),
      row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
      row.centerYAnchor.constraint(equalTo: centerYAnchor),
      line.leadingAnchor.constraint(equalTo: leadingAnchor),
      line.trailingAnchor.constraint(equalTo: trailingAnchor),
      line.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  required init?(coder: NSCoder) { fatalError("FindBar is built in code") }

  /** Finds the field's text after the current match, or before it when `backwards`; an empty field finds nothing. */
  func find(backwards: Bool) {
    let text = field.stringValue
    guard let web, !text.isEmpty else { return status.stringValue = "" }
    let config = WKFindConfiguration()
    config.backwards = backwards
    web.find(text, configuration: config) { [weak self] result in
      self?.status.stringValue = result.matchFound ? "" : "Not found"
    }
  }

  @objc private func nextMatch() { find(backwards: false) }
  @objc private func previousMatch() { find(backwards: true) }
  @objc private func done() { close() }

  func controlTextDidChange(_ notification: Notification) { status.stringValue = "" }

  func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
    switch selector {
    case #selector(NSResponder.cancelOperation(_:)):
      close()
      return true
    case #selector(NSResponder.insertNewline(_:)):
      find(backwards: NSApp.currentEvent?.modifierFlags.contains(.shift) == true)
      return true
    default:
      return false
    }
  }
}
