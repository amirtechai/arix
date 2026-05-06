class Guncode < Formula
  desc "Provider-agnostic AI coding CLI — Claude, GPT-4, Gemini, Llama and more"
  homepage "https://github.com/amirtechai/arix"
  url "https://registry.npmjs.org/arix/-/arix-0.1.0.tgz"
  # sha256 is updated by the release workflow — placeholder below
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    output = shell_output("#{bin}/arix --version")
    assert_match "0.1.0", output
  end
end
