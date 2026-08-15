const vscode = require("vscode");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

let pollInterval;
let currentProvider;

function activate(context) {
  currentProvider = new MusicWebviewViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "mprisMusicWebview",
      currentProvider,
    ),
  );

  startPlaybackPolling();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("mprisMusicControl.refreshInterval")) {
        startPlaybackPolling();
      } else if (e.affectsConfiguration("mprisMusicControl")) {
        if (currentProvider) currentProvider.updatePlaybackStatus();
      }
    }),
  );
}

function startPlaybackPolling() {
  if (pollInterval) clearInterval(pollInterval);
  const config = vscode.workspace.getConfiguration("mprisMusicControl");
  const interval = config.get("refreshInterval", 1000);
  pollInterval = setInterval(() => {
    if (currentProvider) currentProvider.updatePlaybackStatus();
  }, interval);
}

class MusicWebviewViewProvider {
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = undefined;
    this.trackDuration = 0;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file("/"), this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.command) {
        case "play":
          exec("playerctl play-pause");
          break;
        case "next":
          exec("playerctl next");
          break;
        case "prev":
          exec("playerctl previous");
          break;
        case "seek":
          if (this.trackDuration > 0) {
            const targetSecond = Math.floor(
              (this.trackDuration * data.value) / 100,
            );
            exec(`playerctl position ${targetSecond}`);
          }
          break;
      }
      setTimeout(() => this.updatePlaybackStatus(), 200);
    });

    this.updatePlaybackStatus();
  }

  updatePlaybackStatus() {
    if (!this._view) return;

    const config = vscode.workspace.getConfiguration("mprisMusicControl");
    const settings = {
      backgroundMode: config.get("backgroundMode", "adaptive"),
      customBackgroundColor: config.get("customBackgroundColor", "#1e1e1e"),
      backgroundOpacity: config.get("backgroundOpacity", 0.35),
      artRadius: config.get("artRadius", 4),
      artSpin: config.get("artSpin", false),
    };

    const customFallback = config.get("fallbackArtPath", "").trim();
    let defaultExtensionArt = this._view.webview
      .asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "pfp.jpg"))
      .toString();

    if (customFallback && fs.existsSync(customFallback)) {
      try {
        defaultExtensionArt = this._view.webview
          .asWebviewUri(vscode.Uri.file(customFallback))
          .toString();
      } catch (e) {
        vscode.window
          .showErrorMessage(
            `MPRIS Control: Error reading custom stub. Check the path.`,
            "Open settings",
          )
          .then((selection) => {
            if (selection === "Open settings") {
              vscode.commands.executeCommand(
                "workbench.action.openSettings",
                "mprisMusicControl",
              );
            }
          });

        defaultExtensionArt = this._view.webview
          .asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "pfp.jpg"),
          )
          .toString();
      }
    }

    const cmd =
      'playerctl metadata --format "{{ status }}||{{ artist }}||{{ title }}||{{ mpris:length }}||{{ position }}||{{ mpris:artUrl }}"';

    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        this._view.webview.postMessage({
          type: "offline",
          settings,
          defaultArt: defaultExtensionArt,
        });
        return;
      }

      const [status, artist, title, lengthStr, posStr, artUrl] = stdout
        .trim()
        .split("||");
      const total = lengthStr ? Math.floor(parseInt(lengthStr) / 1000000) : 0;
      this.trackDuration = total;

      const current = posStr ? Math.floor(parseInt(posStr) / 1000000) : 0;
      const progress = total > 0 ? (current / total) * 100 : 0;
      const formatTime = (s) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

      let finalArt = defaultExtensionArt;
      if (artUrl && artUrl.trim() !== "") {
        const cleanedUrl = artUrl.trim();
        if (cleanedUrl.startsWith("file://")) {
          const decodedPath = decodeURIComponent(
            cleanedUrl.replace("file://", ""),
          );
          finalArt = this._view.webview
            .asWebviewUri(vscode.Uri.file(decodedPath))
            .toString();
        } else if (cleanedUrl.startsWith("http")) {
          finalArt = cleanedUrl;
        }
      }

      this._view.webview.postMessage({
        type: "update",
        isPlaying: status === "Playing",
        title: title || "Unknown Track",
        artist: artist || "Unknown Artist",
        timeCurrent: formatTime(current),
        timeTotal: total > 0 ? formatTime(total) : "--:--",
        progress: progress,
        artUrl: finalArt,
        settings: settings,
      });
    });
  }

  _getHtmlForWebview() {
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "media",
      "player.html",
    );
    return fs.readFileSync(htmlPath, "utf8");
  }
}

function deactivate() {
  if (pollInterval) clearInterval(pollInterval);
}

module.exports = { activate, deactivate };
