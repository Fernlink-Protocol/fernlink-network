import SwiftUI

struct ContentView: View {
    @StateObject private var vm = DemoViewModel()
    @State private var txInput = ""

    var body: some View {
        ZStack {
            Color(hex: "0F1420").ignoresSafeArea()
            VStack(spacing: 0) {
                headerBar
                inputRow
                Divider().background(Color(hex: "1E2940"))
                HStack(spacing: 0) {
                    logPanel(title: "VERIFIER",   log: vm.verifierLog)
                    Divider().background(Color(hex: "1E2940"))
                    logPanel(title: "REQUESTER",  log: vm.requesterLog)
                }
                .frame(maxHeight: .infinity)
            }
        }
        .onAppear  { vm.start() }
        .onDisappear { vm.stop() }
    }

    // MARK: - Subviews

    private var headerBar: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(vm.peerCount > 0 ? Color(hex: "22C55E") : Color(hex: "374151"))
                .frame(width: 10, height: 10)
            Text("fernlink demo")
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
            Spacer()
            Text(vm.peerCount > 0
                 ? "\(vm.peerCount) peer\(vm.peerCount == 1 ? "" : "s")"
                 : "scanning…")
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(vm.peerCount > 0 ? Color(hex: "22C55E") : Color(hex: "9CA3AF"))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(hex: "1A1F2E"))
    }

    private var inputRow: some View {
        HStack(spacing: 8) {
            TextField("tx signature (blank = devnet sample)", text: $txInput)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.white)
                .tint(Color(hex: "6366F1"))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color(hex: "1E2940"))
                .cornerRadius(6)

            Button(action: { Task { await vm.verify(customSig: txInput) } }) {
                Group {
                    if vm.isVerifying {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Text("VERIFY")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    }
                }
                .frame(width: 70, height: 32)
            }
            .background(vm.isVerifying ? Color(hex: "374151") : Color(hex: "6366F1"))
            .cornerRadius(6)
            .disabled(vm.isVerifying)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(hex: "0F1420"))
    }

    private func logPanel(title: String, log: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(Color(hex: "9CA3AF"))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(hex: "1A1F2E"))

            ScrollViewReader { proxy in
                ScrollView {
                    Text(log.isEmpty ? " " : log)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(Color(hex: "D1D5DB"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .id("bottom")
                }
                .background(Color(hex: "0F1420"))
                .onChange(of: log) { _ in
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Hex color helper

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let n = UInt64(h, radix: 16) ?? 0
        let r = Double((n >> 16) & 0xFF) / 255
        let g = Double((n >>  8) & 0xFF) / 255
        let b = Double( n        & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
