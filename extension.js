const vscode = require("vscode");
const { exec } = require("child_process");

let pollInterval;

function activate(context) {
  const provider = new MusicWebviewViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("mprisMusicWebview", provider),
  );

  pollInterval = setInterval(() => {
    provider.updatePlaybackStatus();
  }, 1000);
}

class MusicWebviewViewProvider {
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = undefined;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file("/"), this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview();

    this.trackDuration = 0;

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

    const cmd =
      'playerctl metadata --format "{{ status }}||{{ artist }}||{{ title }}||{{ mpris:length }}||{{ position }}||{{ mpris:artUrl }}"';

    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        this._view.webview.postMessage({ type: "offline" });
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

      const localArtUri = vscode.Uri.joinPath(
        this._extensionUri,
        "media/pfp.jpg",
      );
      const defaultExtensionArt = this._view.webview
        .asWebviewUri(localArtUri)
        .toString();

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
        title: title || "Unknown",
        artist: artist || "Unknown",
        timeCurrent: formatTime(current),
        timeTotal: total > 0 ? formatTime(total) : "--:--",
        progress: progress,
        artUrl: finalArt,
      });
    });
  }

  _getHtmlForWebview() {
    return `
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; margin: 0; }
                    .player-container { display: flex; align-items: center; background: var(--vscode-welcomePage-tileBackground, rgba(0,0,0,0.1)); padding: 8px; border-radius: 6px; }
                    .album-art { width: 64px; height: 64px; border-radius: 4px; object-fit: cover; background: #333; margin-right: 12px; flex-shrink: 0; }
                    .info-block { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; }
                    .title { font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
                    .artist { font-size: 11px; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px; }
                    
					.timeline-container { display: flex; align-items: center; font-size: 10px; opacity: 0.6; margin-bottom: 6px; }
					.progress-bar { 
						flex-grow: 1; 
						height: 6px; 
						background: var(--vscode-widget-shadow, #444); 
						margin: 0 6px; 
						border-radius: 3px; 
						overflow: hidden; 
						cursor: pointer; 
						position: relative;
					}
					.progress-bar:hover { height: 8px; border-radius: 4px; }
					.progress-fill { height: 100%; width: 0%; background: var(--vscode-button-background, #007acc); pointer-events: none; }

                    .controls { display: flex; gap: 14px; align-items: center; justify-content: flex-start; }
                    .btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 4px; opacity: 0.8; display: flex; align-items: center; }
                    .btn:hover { opacity: 1; color: var(--vscode-button-background); }
                    .btn svg { width: 16px; height: 16px; fill: currentColor; }
                    .btn-play svg { width: 20px; height: 20px; }
                    
                    .offline-msg { text-align: center; opacity: 0.5; padding: 20px; font-size: 12px; }
                </style>
            </head>
            <body>
                <div id="player" class="player-container" style="display: none;">
                    <img id="art" class="album-art" src="" alt="Cover" />
                    <div class="info-block">
                        <div id="title" class="title">Loading...</div>
                        <div id="artist" class="artist">...</div>
                        
                        <div class="timeline-container">
                            <span id="time-current">0:00</span>
                            <div class="progress-bar" onclick="seekTrack(event)">
								<div id="progress" class="progress-fill"></div>
							</div>

                            <span id="time-total">0:00</span>
                        </div>
                        
                        <div class="controls">
                            <button class="btn" onclick="send('prev')">
                                <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                            </button>
                            <button class="btn btn-play" onclick="send('play')">
                                <svg id="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </button>
                            <button class="btn" onclick="send('next')">
                                <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zm-11 0l8.5 6L5 18z"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div id="offline" class="offline-msg">No player</div>

                <script>
                    const vscode = acquireVsCodeApi();
                    function send(command) { vscode.postMessage({ command }); }

					function seekTrack(event) {
						const progressBar = event.currentTarget;
						const rect = progressBar.getBoundingClientRect();
						const clickX = event.clientX - rect.left;
						const width = rect.width;
						
						const percentage = Math.max(0, Math.min(100, (clickX / width) * 100));
						
						document.getElementById('progress').style.width = percentage + '%';
						
						vscode.postMessage({ command: 'seek', value: percentage });
					}

                    window.addEventListener('message', event => {
                        const msg = event.data;
                        const player = document.getElementById('player');
                        const offline = document.getElementById('offline');

                        if (msg.type === 'offline') {
                            player.style.display = 'none';
                            offline.style.display = 'block';
                            return;
                        }

                        player.style.display = 'flex';
                        offline.style.display = 'none';

                        document.getElementById('title').innerText = msg.title;
                        document.getElementById('artist').innerText = msg.artist;
                        document.getElementById('time-current').innerText = msg.timeCurrent;
                        document.getElementById('time-total').innerText = msg.timeTotal;
                        document.getElementById('progress').style.width = msg.progress + '%';
                        document.getElementById('art').src = msg.artUrl;

                        const playIcon = document.getElementById('play-icon');
                        if (msg.isPlaying) {
                            playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
                        } else {
                            playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
                        }
                    });
                </script>
            </body>
            </html>
        `;
  }
}

function deactivate() {
  if (pollInterval) clearInterval(pollInterval);
}

module.exports = { activate, deactivate };
