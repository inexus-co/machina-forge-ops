/**
 * Traditional Chinese.
 *
 * The key is the English sentence exactly as it stands in the source — see `shared/i18n.ts` for
 * why. A sentence absent here is shown in English, so an unfinished translation is visibly
 * unfinished rather than broken, and `i18n.test.ts` fails naming anything the screens ask for
 * that this file cannot answer.
 *
 * Two forms separated by `|` are singular and plural, chosen on `count`. `{name}` is filled in by
 * the caller and has to survive translation — a placeholder dropped here goes missing on screen.
 *
 * Not simplified characters converted one by one — the vocabulary differs. A package is 套件
 * here and 软件包 on the mainland, so a kit has to be 工具組 to stay a different thing.
 */

import type { Messages } from "../i18n";

export const ZH_HANT: Messages = {

  // index.ts
  "Machina Forge Ops": "Machina Forge Ops",

  // controller.ts
  "That agent is not registered.": "該代理未登記。",
  "No model is registered for {name} to use.": "未登記 {name} 使用的模型。",
  "this machine": "本機",
  "That server is not registered.": "該伺服器未登記。",
  "No model is registered. Add one in the settings.": "尚未登記模型。請在設定中新增模型。",
  "\"{name}\" has no address and no model name.": "「{name}」未填入連線目標與模型名。",
  "\"{name}\" has no API key set.": "「{name}」未設定 API 金鑰。",
  "This machine can isolate. Running without isolation is not needed.": "本機具備隔離機制，不需要無隔離執行。",
  "That file cannot be opened.": "無法開啟該檔案。",
  "{name}-work-report.md": "{name}-工作報告.md",

  // diff.ts
  "@@ {count} unchanged lines @@": "@@ 未變更的 {count} 行 @@",

  // facts.ts
  "This server's state could not be read.": "無法讀取此伺服器的狀態。",
  "{days}d": "{days} 天",
  "{hours}h": "{hours} 小時",
  "{minutes}m": "{minutes}分",
  "OS: {os}": "作業系統：{os}",
  "Up: {uptime}": "運行：{uptime}",
  "Load {load}": "負載 {load}",
  "{cores} cores": "{cores} 核",
  "CPU: {detail}": "CPU：{detail}",
  " (swap {used} / {total})": "（交換 {used} / {total}）",
  "Memory: {used} of {total} used{swap}": "記憶體：已用 {used} / {total}{swap}",
  " (over 80%)": "※超過 80%",
  "Disks: {disks}": "磁碟：{disks}",
  "{count} failed ({names}{more}), ": "失敗 {count}（{names}{more}）、",
  " and more": " 等",
  "Services: {failed}{active} of {total} running": "服務：{failed}執行 {active} / {total}",
  "Containers: {running} running{names}{stopped}": "容器：執行 {running}{names}{stopped}",
  ", {count} stopped": " 已停止 {count}",
  "Ports reachable from outside: {ports}{more}": "外部可達的連接埠：{ports}{more}",
  "firewall: {kind} {state}": "firewall：{kind} {state}",
  "on": "已啟用",
  "off": "未啟用",
  " ({count} security)": "（安全更新 {count}）",
  "  restart needed": "　需要重新啟動",
  "Updates: {count}{security}{reboot}": "更新：{count} 個{security}{reboot}",
  "Could not be read: {notes}": "未能讀取：{notes}",
  "[State]": "【狀態】",
  "[Inventory]": "【構成】",
  "Services in failure: {names}": "失敗中的服務：{names}",
  "Every listening port:": "所有監聽連接埠：",
  " (reachable from outside)": "（外部可達）",
  " (this machine only)": "（僅限本機內部）",
  "Scheduled jobs:": "定時執行：",
  "Images:": "映像：",
  "Nothing could be read.": "沒有可讀取的資訊。",

  // policy.ts
  "The command is empty.": "命令為空。",
  "The command is too long (up to {max} characters).": "命令過長（最多 {max} 個字元）。",
  "{what} cannot be used. Write one command on one line. Anything needing a pipe or a redirect is run by a person.":
    "不能使用 {what}。請在一行中只寫一條命令。需要管線或重新導向的處理，由人來執行。",
  "This agent ({name}) is not allowed sudo.": "此 Agent（{name}）不允許使用 sudo。",
  "sudo {option} has no value.": "sudo {option} 沒有值。",
  "sudo {option} cannot be used.": "不能使用 sudo 的 {option}。",
  "There is no command after sudo.": "sudo 之後沒有命令。",
  "Write the command by name rather than by path ({name}).": "請用命令名稱而不是路徑來寫（{name}）。",
  "{program} is not on this agent's list ({name}). It may use: {allowed}":
    "{program} 不在此 Agent（{name}）的許可清單中。可用的是 {allowed}。",
  "sudo is confirmed every time.": "sudo 每次都要確認。",
  "{program} can be impossible to undo.": "{program} 可能無法挽回。",
  "It points at a device.": "指向了裝置。",
  "{name} may run {program} on its own only as: {verbs}": "{name} 可自動執行的只有 {program} {verbs}。",
  "{program} with no arguments. This list names the verbs it may use.":
    "以無參數執行 {program}。此許可清單指定了動詞。",
  "{name} does not let {program} run on its own.": "{name} 未將 {program} 列為自動執行的對象。",
  "{program} is refused by {name}. Find another way.": "{program} 在{name}中被禁止。請另想辦法。",
  "{program} is a kind of command that is never run — {summary}. Find another way.":
    "{program} 屬於不允許執行的種類 — {summary}。請另想辦法。",
  "{program} cannot be run on the server. Copy what you need across with fetch_log or read_file and work on it in run_local, where it is isolated.":
    "{program} 不能在目標伺服器上執行。請用 fetch_log 或 read_file 把需要的資料複製到工作區，在 run_local（隔離）中處理。",
  "{program} {verb} can be impossible to undo.": "{program} {verb} 可能無法挽回。",
  "{program} {flag} can be impossible to undo.": "{program} {flag} 可能無法挽回。",
  "This reads the whole machine, end to end. It takes time, and it can slow down whatever that server is for.":
    "會從頭到尾讀取整台伺服器。耗時較長，並可能影響正在運行的東西。",
  "It may run on its own only as: {program} {verbs}": "可自動執行的只有 {program} {verbs}。",
  "{program} is set to be confirmed every time.": "{program} 被設定為每次都要確認。",
  "This agent is set to confirm reads as well.": "此 Agent 設定為讀取也要確認。",
  "It may run on its own only as a read: {program} {verbs}": "可自動執行的只有 {program} 的讀取（{verbs}）。",
  "{program} can change the server.": "{program} 是可以改變伺服器的命令。",
  "{program} is known here, but nobody has judged yet whether it reads or writes.":
    "已掌握 {program}，但尚未判斷它是讀取還是寫入。",
  "Nothing has been decided about {program} yet.": "{program} 的處理方式尚未決定。",

  // prompt.ts
  "notes": "有備註",
  "{count} handover|{count} handovers": "交接 {count} 條",
  "{count} lines of facts": "事實摘要 {count} 行",
  "the facts could not be read": "無法讀取事實",
  "nothing": "沒有資訊",
  "Handed over the logbook: {summary}": "已交付台帳：{summary}",

  // report.ts
  "Finished": "已完成",
  "Stopped": "已停止",
  "Error": "錯誤",
  "Timed out": "逾時",
  "Waiting for an answer": "等待回答",
  "Hit the limit": "達到上限",
  "not carried out: {reason}": "未執行：{reason}",
  "Fetched a log: {what}": "取得日誌：{what}",
  "Fetched a file: {what}": "取得檔案：{what}",
  "Ran a supporting task": "執行了輔助作業",
  "failed: {reason}": "失敗：{reason}",
  "timed out": "逾時",
  "run": "已執行",
  "exit code {code}": "結束碼 {code}",
  "(no goal was written)": "（未記載目的）",
  "Not finished": "未完成",
  "Result": "結果",
  "What was done": "實施內容",
  "Period: {from} to {to}": "對象期間：{from} 〜 {to}",
  "the beginning": "最初",
  "now": "現在",
  "{host} — work report": "{host} 工作報告",
  "Written: {when}": "產生時間：{when}",
  "Runs: {count}": "執行數：{count}",
  "There were no runs in this period.": "此期間沒有執行紀錄。",
  "Handovers": "交接紀錄",

  // resourcesController.ts
  "Catalogue": "目錄",
  "Not one model is registered. Register one first.": "尚未登記任何模型。請先登記模型。",
  "Cancelled.": "已取消。",
  "Permission received. Finishing up…": "已收到授權。正在完成…",

  // review.ts
  "The model's answer was not JSON.": "模型的回答不是 JSON。",
  "The model's answer could not be read.": "無法讀取模型的回答。",
  "The model returned no summary.": "模型沒有返回摘要。",
  "The model could not be asked to read it: {reason}": "無法讓模型讀取：{reason}",

  // docker.ts
  "…(cut: too long)": "…（過長，已截斷）",
  "The container could not be started: {reason}": "無法啟動容器：{reason}",

  // serverContext.ts
  "That is not a valid host id: {id}": "無效的主機 ID：{id}",

  // session.ts
  "It is already running.": "已經在執行中。",
  "read the make-up and state again": "重新讀取機器的組態與狀態",
  "Send a goal first.": "請先傳送目標。",
  "That did not reach the agent: {reason}": "這句話沒有送到代理：{reason}",
  "Finished.": "已完成。",
  "Handed over {title}'s screen ({lines} lines).": "已交付{title}的畫面（{lines} 行）。",
  "It cannot be cleared while running. Stop it first.": "執行中無法刪除。請先停止。",
  "From now on, {what} will not be used on this server.": "今後在此伺服器上不再使用 {what}。",
  "For this conversation, {what} will not be used.": "在本次對話期間不使用 {what}。",
  "From now on, {what} runs on its own on this server.": "今後在此伺服器上自動執行 {what}。",
  "For this conversation, {what} runs on its own.": "在本次對話期間自動執行 {what}。",
  "Stopped by you": "已停止",
  "Used the extension's tool {name}.": "使用了擴充的工具 {name}。",
  "A file outside the working directory cannot be saved.": "無法儲存工作目錄之外的檔案。",
  "That is not a file.": "這不是檔案。",
  "Handed to {name}: {task}": "已交給 {name}：{task}",
  "{name} has reported back.": "{name} 已回報。",
  "This result was left in the handover.": "已把此結果留在交接紀錄中。",

  // store.ts
  "Model": "模型",
  "not named": "未指定",
  "Settings": "設定",

  // commandRunner.ts
  "The command could not be started: {reason}": "無法啟動命令：{reason}",

  // controller.ts
  "A host name cannot contain URL punctuation.": "主機名稱不能包含 URL 符號。",
  "Session": "工作階段",
  "Enter the password.": "請輸入密碼。",
  "No SSH is set up for this server.": "此伺服器未設定 SSH。",
  "Check this server's key first.": "請先確認此伺服器的金鑰。",
  "No key file has been chosen.": "尚未選擇金鑰檔案。",
  "The key file cannot be read: {path}": "無法讀取金鑰檔案：{path}",
  "Session {n}": "工作階段 {n}",
  "No session is open for this server.": "此伺服器沒有開啟的工作階段。",
  "Choose a private key": "選擇私密金鑰",
  "Choose": "選擇",
  "No RDP is set up for this server.": "此伺服器未設定 RDP。",
  "This server is connected on the VNC screen. Disconnect that first.": "此伺服器已透過 VNC 畫面連線。請先斷開。",
  "No screen (VNC) is set up for this server.": "此伺服器未設定畫面（VNC）。",
  "This server is connected on the RDP screen. Disconnect that first.": "此伺服器已透過 RDP 畫面連線。請先斷開。",
  "Choose the files to send": "選擇要上傳的檔案",
  "Send": "傳送",
  "Choose where to save": "選擇儲存位置",
  "Save here": "儲存到此處",
  "Servers": "伺服器",

  // export.ts
  "CSV (spreadsheet)": "CSV（電子試算表）",
  "Markdown (report)": "Markdown（報告）",
  "When": "時間",
  "Who": "執行者",
  "Command": "命令",
  "Output": "輸出",
  "# Command history — {host}": "# 命令歷史 — {host}",
  "Written out: {when}": "匯出時間：{when}",
  "## Output": "## 輸出",
  "Command history — {host}": "命令歷史 — {host}",
  "Written out: {when} · {count} rows": "匯出時間：{when}・{count} 條",
  "command-history_{host}_{stamp}": "命令歷史_{host}_{stamp}",
  "Write out the command history": "匯出命令歷史",

  // hostKeys.ts
  "This server's key is not the one recorded. Either {where} was rebuilt, or it is a different server. Recorded {expected} / now {found}. If you rebuilt it, forget this server's key in the settings and then connect.":
    "此伺服器的金鑰與上次不同。{where} 可能被重建過，或者是另一台伺服器。上次 {expected} / 本次 {found}。如果是重建過，請先在設定中讓它忘記此伺服器的金鑰，再連線。",
  "The key at {where} was not trusted.": "未信任 {where} 的金鑰。",

  // controller.ts
  "This server's reading was too long and stopped part way.": "此伺服器的讀取內容過長，中途被截斷。",
  "This server's make-up cannot be read — it appears to be neither Linux nor Windows.":
    "無法讀取此伺服器的構成。看起來既不是 Linux 也不是 Windows。",
  "That log cannot be opened.": "無法開啟該日誌。",
  "The log cannot be opened: {reason}": "無法開啟日誌：{reason}",

  // jump.ts
  "Jump server: {reason}": "跳板機：{reason}",
  "The jump server cannot reach {where}: {reason}": "無法從跳板機連線到 {where}：{reason}",

  // localeController.ts
  "That is not a language this can use.": "無法處理該語言。",

  // window.ts
  "{label} — {host}": "{label} — {host}",

  // rdpSession.ts
  "This build has no screen (RDP) viewer in it. Sessions over SSH, files and the agent all still work.":
    "此版本未包含畫面（RDP）的顯示部分。SSH 的工作階段、檔案與 Agent 仍可照常使用。",
  "The RDP helper has not been built. Run native/rdp/build.sh (FreeRDP 3 is required).":
    "RDP 輔助程式尚未建置。請執行 native/rdp/build.sh（需要 FreeRDP 3）。",
  "This server's certificate is not the one recorded. Either {where} was rebuilt, or it is a different server. If you rebuilt it, forget this server's key in the settings and then connect.":
    "此伺服器的證書與上次不同。{where} 可能被重建過，或者是另一台伺服器。如果是重建過，請先在設定中讓它忘記此伺服器的金鑰，再連線。",
  "The helper exited ({code})": "輔助程式已結束（{code}）",
  "The clipboard contents are too large.": "剪貼簿的內容過大。",
  "The screen stream lost its place.": "畫面接收失去了同步。",

  // controller.ts
  "The recording cannot be read.": "無法讀取錄製的內容。",
  "There is no such recording.": "沒有該錄製。",
  "Write out the recording": "匯出錄製",
  "screen-recording_{host}_{stamp}": "畫面錄製_{host}_{stamp}",
  "WebM (video)": "WebM（影片）",

  // store.ts
  "That recording is no longer open.": "該錄製已不再開啟。",
  "Stopped: it grew too large.": "因過大而停止。",
  "The recording grew too large and was stopped.": "錄製過大，已停止。",
  "That name points outside the recording.": "該名稱指向錄製之外。",

  // sshSession.ts
  "A shell could not be opened: {reason}": "無法開啟 shell：{reason}",
  "reason unknown": "原因不明",
  "tmux is not available; opening an ordinary shell.": "沒有 tmux，將開啟普通的 shell。",
  "The other end could not be verified: its key differs from the one recorded, or you answered that you do not trust it.":
    "無法確認連線目標。金鑰與上次不同，或你回答了不信任。",
  "The key file cannot be read. Check its format, or the passphrase.": "無法讀取金鑰檔案。請確認格式或密碼短語。",
  "The key needs a passphrase.": "該金鑰需要密碼短語。",
  "Signing in failed. Check the user name, and the password or the key.": "認證失敗。請確認使用者名稱，以及密碼或金鑰。",
  "The connection was refused. Check that SSH is running.": "連線被拒絕。請確認 SSH 是否在執行。",
  "No answer. Check the address and the port.": "沒有回應。請確認位址與連接埠。",
  "The host name cannot be resolved.": "無法解析主機名稱。",

  // controller.ts
  "This server's state cannot be read — it appears to be neither Linux nor Windows.":
    "無法讀取此伺服器的狀態。看起來既不是 Linux 也不是 Windows。",

  // bridge.ts
  "The key at the other end differs. Expected {expected} / found {found}":
    "連線目標的金鑰不符。期望 {expected} / 實際 {found}",
  "Nothing to connect to was handed over.": "未傳入連線目標。",
  "Connecting to {where}…": "正在連線 {where}…",
  "— The connection has ended. You can close this window.": "— 連線已結束。可以關閉此視窗。",

  // rfb.ts
  "The screen data is too large.": "畫面資料過大。",
  "The connection was refused.": "連線被拒絕。",
  "This server asked for a way of signing in that is not supported.": "此伺服器要求了不支援的認證方式。",
  "This server's sign-in parameters are not valid.": "此伺服器的認證參數不正確。",
  "Could not answer this server's sign-in (Apple).": "無法回應此伺服器的認證（Apple）。",
  "Could not answer this server's sign-in (UltraVNC).": "無法回應此伺服器的認證（UltraVNC）。",
  "This server's VeNCrypt ({version}) is not supported.": "不支援此伺服器的 VeNCrypt（{version}）。",
  "This server would not accept VeNCrypt 0.2.": "此伺服器不接受 VeNCrypt 0.2。",
  "This server offered no way of signing in that can be used.": "此伺服器沒有返回可用的認證方式。",
  "This server refused to connect over TLS.": "此伺服器拒絕了 TLS 連線。",
  "Either the password is wrong, or the sign-in was refused.": "密碼錯誤，或認證被拒絕。",
  "Part of the screen points outside the screen.": "畫面的一部分指向畫面之外。",
  "The screen could not be decompressed.": "畫面解壓失敗。",
  "Unsupported encoding ({encoding}).": "不支援的編碼（{encoding}）。",
  "The screen size is not valid ({width}×{height}).": "畫面尺寸不正確（{width}×{height}）。",

  // security.ts
  "This server's VNC asks to connect over anonymous TLS, which is TigerVNC's default. That way is not supported. Either set up an X509 certificate on the server, or go through a jump server and allow sending in the clear in the settings.":
    "此伺服器的 VNC 要求使用匿名 TLS 連線（TigerVNC 的預設設定）。本應用不支援該方式。請在伺服器端設定 X509 證書，或經由跳板機並在設定中允許以明文傳送。",
  "This server wants a user name and a password. Fill them in under the connection settings.":
    "此伺服器需要使用者名稱與密碼。請在連線設定中填入。",
  "This server asked for a way of signing in that is not supported ({types}).":
    "此伺服器要求了不支援的認證方式（{types}）。",
  "This server accepts only Plain, which sends the password in the clear. If you are inside a jump server or a VPN, tick \"Allow the password to be sent in the clear\" in the connection settings.":
    "此伺服器只接受以明文傳送密碼的方式（Plain）。如果是在跳板機或 VPN 內部使用，請在連線設定中勾選「允許以明文傳送密碼」。",
  "This server wants a user name. Fill it in under the connection settings.":
    "此伺服器需要使用者名稱。請在連線設定中填入。",

  // zrle.ts
  "The ZRLE data is incomplete.": "ZRLE 的資料不足。",
  "Unsupported ZRLE tile ({tile}).": "不支援的 ZRLE 圖塊（{tile}）。",

  // vncSession.ts
  "Could not reach {where} (timed out).": "無法連線 {where}（逾時）。",
  "The connection to {where} went away.": "與 {where} 的連線已斷開。",
  "{where} presented no certificate.": "{where} 沒有出示證書。",
  "Encryption (TLS) with {where} failed: {reason}": "與 {where} 的加密（TLS）失敗：{reason}",
  "{where} refused the connection. Check that VNC is running and that the port is right.":
    "{where} 拒絕了連線。請確認 VNC 是否在執行、連接埠是否正確。",
  "{where} cannot be reached. Check the route and the firewall.": "無法到達 {where}。請檢查路由與防火牆。",
  "No server by the name {where} could be found.": "找不到名為 {where} 的伺服器。",
  "{where} cut the connection.": "與 {where} 的連線被切斷。",
  "Connecting to {where} failed.": "連線 {where} 失敗。",

  // secretStore.ts
  "Credentials cannot be encrypted on this machine. Rather than write a password out in the clear, nothing was saved.":
    "此環境無法加密儲存憑證。為了不以明文寫出密碼，已中止儲存。",
  "The saved credentials cannot be read. They may have been encrypted by another user, or on another machine.":
    "無法讀取已儲存的憑證。可能是由其他使用者或其他機器加密的。",
  "The saved credentials are not in a shape this can read.": "已儲存的憑證格式不正確。",

  // screenCapture.ts
  "This screen cannot be recorded.": "此畫面無法錄製。",

  // ErrorBoundary.tsx
  "This screen could not be drawn": "無法顯示此畫面",
  "Nothing was sent to the machine you are working on. Reload, or look at the developer console for the cause.":
    "沒有向目標電腦傳送任何操作。請重新載入，或在開發者工具的主控台查看原因。",
  "Reload": "重新載入",

  // AgentSettingsForm.tsx
  "A browser has opened. Give permission there.": "已開啟瀏覽器。請在那裡授權。",
  "A browser has opened. Type this code into it.": "已開啟瀏覽器。請在那個畫面輸入此代碼。",
  "Who the agent asks. It is the same for every server, and each run can pick one from the conversation's menu. What gets sent is the goal you wrote, the commands the agent ran and what came back. Where a customer's output ends up differs by model, so check before choosing.":
    "這是 Agent 向誰提問。對所有伺服器通用，每次執行可從對話選單中選擇。傳送出去的是你寫的目標、Agent 執行的命令及其輸出。客戶伺服器的輸出會去到哪裡，因模型而異，選擇前請先確認。",
  "Registered": "已登記",
  "+ Add a model": "＋ 新增模型",
  "None yet. Until one is added, the agent cannot run.": "還沒有。新增一個之前，Agent 無法執行。",
  "Make it the default": "設為預設",
  "(no name)": "（無名稱）",
  "Delete": "刪除",
  "Model settings": "模型的設定",
  "New model": "新的模型",
  "Close": "關閉",
  "What to call it (it appears in the conversation's menu)": "稱呼（會出現在對話選單中）",
  "Our GPU box / the GPT subscription": "公司內部 GPU 機 / 已簽約的 GPT",
  "How will you use it?": "要如何使用？",
  "Through a subscription": "使用簽約方案",
  "ChatGPT, Claude and the like, paid monthly. You sign in": "ChatGPT、Claude 等按月簽約的服務。需要登入",
  "With an API key": "使用 API 金鑰",
  "Gemini, OpenAI, our own GPU box. You fill in a URL and a key":
    "Gemini、OpenAI、公司內部 GPU 機。需填入 URL 與金鑰",
  "Service": "服務",
  "Sign out": "登出",
  "Starting the sign-in…": "正在開始登入…",
  "Signed in.": "已登入。",
  "Could not sign in. Try again — if the browser page is still open, close it first.":
    "登入失敗。請再試一次。如果瀏覽器畫面還開著，請先關閉再按。",
  "Sign in": "登入",
  "Signing in…": "登入中…",
  "Model ID (empty means {model})": "模型 ID（留空則為 {model}）",
  "Model ID (the name that service calls it)": "模型 ID（該服務自己使用的名稱）",
  "The URL to reach (ending in /v1)": "連線目標的 URL（末尾為 /v1）",
  "API key (encrypted and kept on this machine)": "API 金鑰（在本機加密保存）",
  "Saved. Type only to change it": "已儲存。僅在變更時輸入",
  "Forget the saved key": "刪除已儲存的金鑰",
  "It can read images (an agent that works the screen needs this)": "可以讀取圖像（操作畫面的 Agent 需要此項）",
  "Cancel": "取消",
  "Save": "儲存",
  "Add": "新增",
  "Saving…": "儲存中…",
  "Run here": "本機執行",
  "The agent can do its analysis and write files in an isolated workspace inside this machine. What that workspace allows is chosen here.":
    "Agent 可以在本機內隔離的工作區中進行分析和產生檔案。此處選擇該工作區的規則。",
  "Isolation": "隔離",
  "The agent can do its analysis and write files in an isolated workspace inside this machine. It has no network there, cannot write outside the workspace, and cannot read your home. What reaches the server is still one allowed command at a time.":
    "Agent 可以在本機內隔離的工作區中進行分析和產生檔案。那裡沒有網路，無法寫到工作區之外，也讀不到你的家目錄。到達伺服器的，仍然只有被允許的一行命令。",
  "How to isolate": "隔離方式",
  "Match this machine (recommended)": "按本機自動選擇（建議）",
  "macOS isolation (sandbox-exec)": "macOS 的隔離（sandbox-exec）",
  "Linux isolation (bubblewrap)": "Linux 的隔離（bubblewrap）",
  "If the isolation you chose cannot be built on this machine, running here is switched off altogether. It is not a limit that a setting can loosen. Choosing Docker requires the image to be here already — nothing is fetched at run time.":
    "如果本機無法準備所選的隔離方式，本機執行本身將被停用。這不是可以透過設定放寬的限制。選擇 Docker 時，所用映像必須已在本機（不會在每次執行時去拉取）。",
  "Isolation on this machine: {wall}": "本機的隔離：{wall}",
  "This machine has no way to isolate.": "本機沒有隔離機制。",
  "Turn this on and the commands the agent writes run": "啟用後，Agent 寫出的命令將",
  "on this machine, with your own privileges": "以你的權限，在本機上",
  ". Your customers' saved credentials and the models' API keys are within reach of those privileges. To get isolation back, install WSL2 or Docker.":
    "被執行。已儲存的客戶憑證與模型的 API 金鑰也在該權限範圍內。要恢復隔離，請安裝 WSL2 或 Docker。",
  "Even switched on, running here still needs": "即使啟用，本機執行仍然",
  "approval line by line": "逐行核准",
  "(the automatic setting does not change this). The record keeps the fact that it ran without isolation.":
    "（自動執行的設定也不改變這一點）。執行紀錄中會留下在無隔離狀態下執行的事實。",
  "Take responsibility and allow running without isolation": "自行承擔責任，啟用無隔離執行",
  " on this machine (": " 在本機（",
  ").": "）上啟用。",
  "default": "預設",
  "Nowhere to connect": "無連線目標",
  "No model named": "未指定模型名",
  " · no key set": "・未設定金鑰",
  "Paste the API key.": "請貼上 API 金鑰。",
  "Which one shall it be?": "要用哪一個繼續？",
  "Paste the code the browser shows after you allow it (or the URL it sends you back to).":
    "請把在瀏覽器授權後出現的代碼（或返回的 URL）貼到這裡。",
  "Sign in to {service}": "登入 {service}",
  "If it will not work, paste the code": "不成功時，貼上代碼",

  // CatalogSection.tsx
  "Automatic": "自動",
  "Runs without asking (destructive ones and sudo are always asked)": "不詢問直接執行（破壞性的與 sudo 始終詢問）",
  "Partly automatic": "部分自動",
  "Runs without asking only in the forms that read": "僅在屬於讀取的寫法下不詢問直接執行",
  "Ask": "確認",
  "Asks a person before every run": "每次執行前都詢問人",
  "Refused": "禁止",
  "Refused without asking, and the reason goes back into the conversation": "不詢問直接拒絕，理由會返回到對話中",
  "A command the catalogue does not have": "目錄中沒有的命令",
  "Command knowledge": "命令知識",
  "This application knows {linux} commands on Linux and {windows} on Windows. The ones that read run on their own, the ones that change a server are asked about, and the ones that destroy always go to a person. To treat a command differently, press its button in the list.":
    "本應用掌握 Linux {linux} 個、Windows {windows} 個命令。讀取類自動執行，會改變伺服器的會先詢問，破壞性的一定交給人決定。要改變某個命令的處理方式，直接在列表中按下按鈕。",
  "Loading…": "載入中…",
  "Rules for everything": "總體規則",
  "Run commands that only read without asking": "讀取類命令不詢問直接執行",
  "Allow sudo (approved each time it is used)": "允許 sudo（每次使用都需要核准）",
  "List": "列表",
  "Search the name or the description (e.g. systemctl, log)": "按名稱或說明搜尋（例：systemctl、日誌）",
  "All": "全部",
  "Show only what you treat differently from the catalogue": "只看與目錄不同處理的項目",
  "Decided by you {count}": "自行決定的 {count}",
  "{note} (automatic: {verbs})": "{note}（自動：{verbs}）",
  "Decided by you": "自行決定的",
  "{count} more. Narrow the search.": "還有 {count} 個。請縮小範圍。",
  "You have not overridden anything. The catalogue's judgement stands.": "沒有自行決定的項目。按目錄的判斷運行。",
  "Nothing found. A command nobody knows can still be run — it stops first and you decide.":
    "找不到。未知的命令同樣可以執行——執行前會停下，由你決定。",
  "What is remembered per server": "按伺服器記住的內容",
  "Clear": "清除",
  "What you chose under \"from now on\" on an approval card during a run. It applies to that server only. Entries cannot be edited one by one — clear them and decide again on the next run.":
    "這是執行中在核准卡片上選擇「今後…」的內容，只對那台伺服器有效。無法逐條修改——請清除後在下次執行時重新決定。",

  // FilesPane.tsx
  "No SSH is set up for this server, so files cannot be handled.": "此伺服器未設定 SSH，無法處理檔案。",
  "↑ Up": "↑ 上一層",
  "+ Send": "＋ 上傳",
  "↓ Fetch ({count})": "↓ 接收（{count}）",
  "↓ Fetch": "↓ 接收",
  "This directory is empty.": "這是空目錄。",
  "Abort": "中止",
  "Open": "開啟",

  // FleetPane.tsx
  "Step by step": "逐條核准",
  "Automatic (destructive and sudo still asked)": "自動（破壞性與 sudo 仍需核准）",
  "Plan only (runs nothing)": "僅計畫（不執行）",
  "Run across servers": "批次執行",
  "Hands the same goal to every server you picked. Each run is on its own — one failure does not touch the others. Each server's record still applies.":
    "把同一個目標一次交給選中的伺服器。每台獨立執行——一台失敗不影響其他。各伺服器的台帳照常生效。",
  "Servers ({count})": "伺服器（{count} 台）",
  "No server here has anywhere to connect to.": "沒有已設定連線目標的伺服器。",
  "Goal": "目標",
  "e.g. Restart nginx and check whether the 502s stopped": "例：重啟 nginx，並確認 502 是否消失",
  "How to approve": "核准方式",
  "Start on {count}": "對 {count} 台開始",
  "Open this server's conversation": "開啟此伺服器的對話",
  "Set up another run": "組建另一次批次執行",
  "Waiting": "待機",
  "Waiting for approval": "等待核准",
  "Command {n}, running…": "第 {n} 條　執行中…",
  "Running…": "執行中…",
  "Done": "完成",
  "It has a question": "有提問",

  // GlobalSettings.tsx
  "Sub-agents": "子代理",
  "Skills": "技能",
  "Prompts": "提示詞",
  "Instructions": "指示",
  "Extensions": "擴充",
  "Packages": "套件",
  "Server keys": "伺服器金鑰",
  "Language": "語言",

  // HostForm.tsx
  "Turn on a screen (RDP or VNC) or SSH.": "請至少啟用畫面（RDP / VNC）或 SSH 之一。",
  "Enter the RDP host.": "請輸入 RDP 的主機。",
  "Enter the VNC host.": "請輸入 VNC 的主機。",
  "Enter the SSH host.": "請輸入 SSH 的主機。",
  "Choose where the private key is.": "請選擇私密金鑰的位置。",
  "This server's settings": "此伺服器的設定",
  "Connection": "連線",
  "Address and account": "位址與帳號",
  "Sign-in": "認證",
  "Password or private key": "密碼或私密金鑰",
  "Route": "經由",
  "Jump server": "跳板機",
  "tmux and keeping it open": "tmux 與保持",
  "Name": "名稱",
  "Customer A, main server": "客戶A 核心伺服器",
  "RDP (screen)": "RDP（畫面）",
  "Host": "主機",
  "Port": "連接埠",
  "User": "使用者",
  "Password": "密碼",
  "RDP password": "RDP 的密碼",
  "VNC (screen)": "VNC（畫面）",
  "User (only if needed)": "使用者（僅在需要時）",
  "Usually left empty": "通常留空即可",
  "VNC password": "VNC 的密碼",
  "Ordinary VNC takes a password and no user name. Fill this in only for the servers that use one — TigerVNC, macOS screen sharing, UltraVNC.":
    "普通的 VNC 只要密碼，不需要使用者名稱。只有 TigerVNC、macOS 螢幕共享、UltraVNC 等使用使用者名稱的伺服器才需要填寫。",
  "Allow the password to be sent in the clear": "允許以明文傳送密碼",
  "Only needed for VNC servers that cannot encrypt. With this on, this server's password crosses the network as it is. Allow it only inside a jump server or a VPN.":
    "僅對無法加密的 VNC 伺服器需要。開啟後，此伺服器的密碼將以原樣透過網路傳輸。請僅在跳板機或 VPN 內部允許。",
  "SSH (session)": "SSH（工作階段）",
  "Open inside tmux on the server (what is running there survives a dropped line)":
    "在伺服器端的 tmux 中開啟（線路斷開後，那邊的執行仍繼續）",
  "Keep it on this machine (the session survives Forge closing)": "在此工作電腦上保持（Forge 關閉後工作階段仍留存）",
  "Unavailable: this machine has no tmux": "此工作電腦沒有 tmux，無法使用",
  "Private key": "私密金鑰",
  "SSH password": "SSH 的密碼",
  "Choose a key": "選擇金鑰",
  "Passphrase (if the key has one)": "密碼短語（如果金鑰設定了）",
  "Leave empty if there is none": "沒有就留空",
  "Jump server (when this one cannot be reached directly)": "跳板機（無法直接連線此伺服器時）",
  "None (connect directly)": "不使用（直接連線）",
  "No server here can act as a jump server yet.": "還沒有可作為跳板機的伺服器。",
  "A jump server is registered like any other server": "跳板機也作為一台伺服器登記",
  "Fill in SSH and add it, and it becomes selectable here.": "填入 SSH 並新增後，就可以在這裡選擇。",
  "Register a jump server": "登記跳板機",
  "Pick another server from the list. Its password, its key and its fingerprint are used exactly as registered.":
    "從列表中選擇另一台伺服器。該伺服器的密碼、金鑰與指紋將按已登記的內容直接使用。",
  "Passwords and passphrases are encrypted into this machine's keystore and never come back to the screen. Save with the box empty and the stored one is kept. The private key itself is not copied — it is read from where you chose, each time you connect.":
    "密碼與密碼短語會加密保存在本機的金鑰庫中，不會回到畫面上。留空儲存則沿用已儲存的內容。私密金鑰本身不會被複製，每次連線時從你選定的位置讀取。",
  "Delete this server": "刪除此伺服器",

  // HostStatusPanel.tsx
  "Without SSH the state cannot be read.": "未設定 SSH，無法讀取狀態。",
  "Reading the state…": "正在讀取狀態…",
  "Measuring": "測量中",
  "Memory": "記憶體",
  "Disk {mount}": "磁碟 {mount}",
  "Disk": "磁碟",
  "1 min / 5 min / 15 min": "1分 / 5分 / 15分",
  "Above the core count": "超過核心數",
  "Up {uptime}": "運行 {uptime}",
  "Collapse": "摺疊",
  "Details": "詳細",
  "Own window": "獨立視窗",
  "Host name": "主機名稱",
  "Kernel": "核心",
  "As of {when}, read over SSH — nothing is installed on the server.":
    "{when} 時點。透過 SSH 讀取——伺服器上沒有安裝任何東西。",
  "{days}d {hours}h": "{days}天 {hours}小時",
  "{hours}h {minutes}m": "{hours}小時 {minutes}分",

  // InventoryPane.tsx
  "Scheduled jobs": "定時執行",
  "Containers": "容器",
  "Logs": "日誌",
  "No SSH is set up for this server, so nothing can be read.": "此伺服器未設定 SSH，無法讀取。",
  "{count} updates": "更新 {count}",
  " ({count} of them security)": "（其中安全更新 {count}）",
  "A restart is needed": "需要重新啟動",
  "Not read yet.": "還沒有讀取。",
  "Listening": "監聽",
  "Process": "行程",
  "Reachable from outside": "外部可達",
  "This machine only": "僅限本機內部",
  "Process names are only visible to an account with the privilege.": "行程名稱只有具備權限的帳號才能看到。",
  "Only what is running": "只看執行中的",
  "Everything, stopped ones too ({count})": "包含已停止的全部（{count}）",
  "No scheduled jobs are set.": "沒有定時執行的設定。",
  "Neither Docker nor Podman was found.": "沒有找到 Docker 或 Podman。",
  "Image": "映像",
  "No firewall was found": "沒有找到 firewall",
  "not in force": "未生效",
  "There is no log that can be read": "沒有可讀取的日誌",
  "Only lines containing this text": "僅包含此文字的行",
  "■ Stop": "■ 停止",
  "▶ Follow": "▶ 跟隨",
  "Waiting…": "正在等待…",
  "Press Follow to show it. It starts with the last 300 lines and then keeps up with whatever arrives.":
    "按「跟隨」顯示。先從最近 300 行開始，之後持續顯示新到的內容。",

  // KartePane.tsx
  "Server logbook": "伺服器台帳",
  "What you see here is handed to the agent at the start of its next run.":
    "此處顯示的內容，會在下次執行開始時交給 Agent。",
  "Your notes": "操作者的備註",
  "What the agent should know about this server (e.g. production DB is web-db; be careful about restarts)":
    "關於這台伺服器，希望 Agent 知道的事（例：生產資料庫是 web-db，重啟需謹慎）",
  "There are unsaved changes": "有未儲存的變更",
  "Saved": "已儲存",
  "Handover": "交接紀錄",
  "None yet. Every run that ends in done leaves its summary here.": "還沒有。每次執行以 done 結束時，其摘要會留在這裡。",
  "Delete this handover": "刪除此交接紀錄",
  "The facts handed to the agent (summary)": "交給 Agent 的事實（摘要）",
  "as of {when}": "{when} 時點",
  "Read again": "重新讀取",
  "With no SSH, the agent is handed the screen and nothing else.": "由於沒有 SSH，只有畫面會交給 Agent。",
  "Could not read it just now: {reason}": "此刻無法讀取：{reason}",
  "(nothing could be read)": "（沒有可讀取的資訊）",
  "Show all": "全部展開",
  "Collapse all": "全部摺疊",
  "What is remembered for this server": "此伺服器記住的內容",
  "None yet. Choosing \"from now on\" on an approval card during a run collects them here.":
    "還沒有。在執行中的核准卡片上選擇「今後…」，就會累積在這裡。",
  "Clear everything remembered for this server": "清除此伺服器記住的全部內容",

  // KitsSection.tsx
  "How to look into the usual set-ups, installed in one go. Once in, the knowledge reaches the agent and the standard investigations are ready in the chat's + menu. Nothing to configure. Permissions and behaviour do not change — what may be run is still the setting for the whole installation.":
    "可以一次性裝入常見構成的排查方法。裝入後，這些知識對 Agent 生效，並可從對話的＋選單立即開始定型排查。無需細節設定。權限與行為不變——可以執行什麼，仍然是整個安裝的設定。",
  "installed": "已裝入",
  "Remove": "移除",
  "Removing…": "移除中…",
  "Install": "安裝",
  "Installing…": "安裝中…",
  "What it installs (knowledge)": "裝入的內容（知識）",
  "What it can look into (one click from the chat)": "可做的排查（從對話一鍵開始）",

  // KnownHostsSection.tsx
  "The fingerprint recorded the first time you connected. From then on this application refuses any server that presents a different key. Forget one here only when you have rebuilt that server.":
    "這是首次連線時記錄的指紋。之後本應用不會連線出示不同金鑰的伺服器。只有在重建伺服器後，才在此讓它忘記。",
  "Recorded keys": "已記錄的金鑰",
  "Nothing recorded yet.": "還沒有記錄任何一台。",
  "Forget": "忘記",

  // LanguageSection.tsx
  "This changes the words on screen, how dates and numbers are written, and the messages this application shows you. The agent answers you in the language you choose here as well.":
    "會改變介面文字、日期與數字的寫法，以及本應用向你顯示的訊息。Agent 回答你時也會使用所選語言。",
  "The language could not be changed.": "無法變更語言。",
  "Anything not yet translated appears in Japanese. The agent's own instructions — what it may run, what it has to ask a person about — stay in Japanese in every language: four copies of the safety rules would mean one of them going stale.":
    "尚未翻譯的部分仍以日文顯示。給 Agent 本身的指示（可以執行什麼、必須先問人什麼）在任何語言下都保持日文——安全規則若分成四份，其中一份終會過時。",
  "The language this application was written in.": "本應用最初書寫所用的語言。",
  "Shows everything in English.": "以英文顯示。",
  "Simplified characters, as used in mainland China.": "以中國大陸使用的簡體字顯示。",
  "Traditional characters, as used in Taiwan and Hong Kong.": "以台灣、香港使用的繁體字顯示。",

  // ProfilesSection.tsx
  "Unnamed agent": "未命名的 Agent",
  "A model, an instruction and a way of approving, kept together under a name. You can pick one in a conversation, or hand work to it from another sub-agent. What it may run is not decided here — every one of them follows the rules under Command knowledge.":
    "把模型、指示與核准方式合為一組並命名。可以在對話中選用，也可以由其他子代理把工作交給它。可以執行什麼不在此決定——所有子代理都遵循「命令知識」中的規則。",
  "+ Add an agent": "＋ 新增代理",
  "None yet. If there is work you do often, you can name the combination and keep it here.":
    "還沒有。如果有經常做的工作，可以給這個組合取個名字留在這裡。",
  "Sub-agent settings": "代理的設定",
  "New agent": "新的代理",
  "Read the logs only / fix production": "只看日誌 / 修復生產環境",
  "Run commands (SSH)": "執行命令（SSH）",
  "Work the screen (RDP)": "操作畫面（RDP）",
  "It works the screen with a mouse and a keyboard. This agent": "用滑鼠與鍵盤操作畫面。此 Agent",
  "cannot run any command at all": "完全不能執行任何命令",
  "— if it could open a shell on the screen and type, the rules about commands would mean nothing. Servers without SSH are looked after this way. For anything that stops a service, use Approve each one and watch it action by action.":
    "——如果它能在畫面上開啟 shell 輸入，關於命令的規則就失去意義了。沒有 SSH 的伺服器用這種方式照看。會停掉服務的操作，請用「逐條核准」逐個操作確認。",
  "The default model": "預設模型",
  "Who it may hand work to (optional)": "可以委派的對象（選填）",
  "Whoever is handed the work uses its own model and its own command rules. It cannot hand the work on again.":
    "被委派者使用自己的模型與自己的命令規則。被委派者不能再往下委派。",
  "Instructions for this agent (optional)": "給此 Agent 的指示（選填）",
  "e.g. On production, always say why before stopping anything": "例：在生產環境，停止任何東西前必須先說明理由",
  "Works the screen": "操作畫面",
  "Runs commands": "執行命令",

  // RemoteAgentChat.tsx
  "Stopped: too many commands (if it is not finished, ask again)": "命令過多，已停止（若尚未完成，請再指示一次）",
  "Stopped at the time limit": "因逾時而停止",
  "Stopped on an error": "因錯誤而停止",
  "Waiting for your answer": "正在等待回答",
  "Approve one command at a time": "逐條命令核准",
  "Auto": "自動執行",
  "sudo and destructive ones are always approved": "sudo 與破壞性操作必須核准",
  "Plan only": "僅計畫",
  "Runs nothing, writes only the steps": "不執行任何操作，只寫步驟",
  "Reads run on their own": "讀取自動",
  "Reads are asked about too": "讀取也要確認",
  "{count} exception|{count} exceptions": "例外 {count}",
  "{count} remembered here": "此伺服器的記憶 {count}",
  "sudo allowed": "允許 sudo",
  "Commands that change the server, and any first-time command, stop before running":
    "會改變伺服器的命令與首次出現的命令，執行前會停下",
  "No screen (RDP or VNC) is set up for this server.": "此伺服器未設定畫面（RDP / VNC）。",
  "Nothing to connect to is set.": "未設定連線目標。",
  "Open the connection settings": "開啟連線設定",
  "Not one model is registered.": "尚未登記任何模型。",
  "\"{name}\" is not fully set up.": "「{name}」的設定不完整。",
  "Chat": "對話",
  "Runs": "執行紀錄",
  "What was run on this server (opens in its own window)": "在此伺服器執行了什麼（在獨立視窗開啟）",
  "Model and allowlist settings": "模型與許可清單的設定",
  "New chat": "新的對話",
  "This machine has no way to isolate. A command the agent runs here runs with your own privileges, as it is. Every line needs approval.":
    "本機沒有隔離機制。Agent 在本機執行的命令，將以你的權限原樣執行。每一行都需要核准。",
  "(no goal)": "（無目標）",
  "Show all ({count})": "全部顯示（共 {count} 條）",
  "You do not need a server yet. Talking through how to look into something, drafting a skill, adding things up here — all of that works.":
    "還不需要伺服器。討論排查方法、起草技能、在本機彙總，都可以在這裡進行。",
  "Write in the box below what you want looked into on this server. Pasting the text of a monitoring alert is fine too.":
    "請在下面的欄中寫下希望在這台伺服器上排查什麼。也可以直接貼上監控告警的文字。",
  "This one had already been decided.": "此操作已經決定過了。",
  "Command {n}, thinking…": "第 {n} 條命令　正在思考…",
  "Thinking…": "正在思考…",
  "Screen": "畫面",
  "Show the commands it ran": "查看執行過的命令",
  "{title}'s screen": "{title}的畫面",
  "Take {title}'s screen away": "移除{title}的畫面",
  "The screen as it will be sent": "交付傳送時的畫面",
  "Send an instruction (e.g. leave that service alone)": "傳送指示（例：不要碰那個服務）",
  "Answer the agent's question": "回答 Agent 的提問",
  "Write what you want done (e.g. put together the steps for surveying an Ubuntu box)":
    "寫下想委託的事（例：整理調查 Ubuntu 構成的步驟）",
  "Write what to look into (e.g. find out why the disk is filling up)": "寫下希望排查什麼（例：調查磁碟緊張的原因）",
  "What to add to this conversation": "為此對話新增的內容",
  "Agent": "代理",
  "None (choose below instead)": "不選擇（在下面單獨選）",
  "Stop": "停止",
  "Start": "開始",
  "Just this once": "僅此一次",
  "Automatic from now on": "今後自動",
  "Refused from now on": "今後禁止",
  "Asked for by {by}": "來自 {by} 的請求",
  "The screen the agent is looking at": "Agent 正在看的畫面",
  "Looking up what it does…": "正在查找說明…",
  "Looking up its history on this server…": "正在查找在此伺服器的歷史…",
  "A first for this server": "這是此伺服器上的首次命令",
  "Run {count} time here before|Run {count} times here before": "在此伺服器過去執行過 {count} 次",
  "(last on {when})": "（最後一次是 {when}）",
  "⚠ {note} (a machine read this; it can be wrong)": "⚠ {note}（這是機器的判斷，可能會讀錯）",
  "Commands of this kind are always asked about — it cannot be made automatic":
    "此類命令每次都要確認（無法設為自動）",
  "Remember this decision": "記住此判斷",
  "Make only \"{program} {verb}\" automatic": "只把「{program} {verb}」設為自動",
  "This particular form cannot be singled out": "無法只針對這種寫法指定",
  "While every command is approved, a remembered decision still stops each time. It takes effect in automatic mode":
    "在逐條核准期間，即使記住也每次都會停下。切換到自動模式後才生效",
  "Run it": "執行",
  "Refuse it": "駁回",
  "You can write why in the box below": "駁回的理由可以寫在下面的欄中",
  "{count} item|{count} items": "{count} 條",
  "Show the {count} before this": "查看之前的 {count} 條",
  "Close the full text": "關閉全文",
  "Show everything it will write": "查看將要寫入的全文",
  "Question": "提問",
  "{bytes} bytes": "{bytes} 位元組",
  "Saved to {where}": "已儲存到 {where}",
  "Show the remaining {count} lines": "查看剩餘 {count} 行",
  "Before": "操作前",
  "After": "操作後",
  "A setting was passed in, so the output was not kept.": "由於傳入了設定值，未儲存輸出。",
  "Rejected": "駁回",
  "Failed": "失敗",
  "exit {code}": "結束 {code}",
  "Approved": "核准",
  "Do not think": "不思考",
  "fast, cheap": "快・便宜",
  "Think a little": "略作思考",
  "Normal": "普通",
  "Think well": "認真思考",
  "slow, dear": "慢・貴",
  "Think it right through": "徹底思考",
  "slowest of all": "最慢",
  "No model set": "未設定模型",
  "just now": "剛剛",
  "{minutes} min ago": "{minutes} 分鐘前",
  "{hours} h ago": "{hours} 小時前",
  "{days} days ago": "{days} 天前",
  "{weeks} weeks ago": "{weeks} 週前",
  "{months} months ago": "{months} 個月前",

  // RemoteWorkspace.tsx
  "State": "狀態",
  "CPU, memory, disk": "CPU・記憶體・磁碟",
  "Inventory": "構成",
  "Ports, services, cron, Docker, logs": "連接埠・服務・cron・Docker・日誌",
  "Logbook": "台帳",
  "Notes, handovers, the facts the agent gets": "備註・交接・交給 Agent 的事實",
  "Files": "檔案",
  "To and from the server": "與伺服器之間的傳輸",
  "Records": "紀錄",
  "The commands run on this server, and what came back": "在此伺服器執行的命令及其輸出",
  "The key at {where} is not the one recorded. Unless you rebuilt it, do not connect. Recorded {expected} / now {found}":
    "{where} 的金鑰與上次不同。若非重建過，請不要連線。上次 {expected} / 本次 {found}",
  "Disconnected": "已斷開",
  "This screen is not up yet. Connect first, then record.": "此畫面尚未出現。請先連線再錄製。",
  "Stopped, because the connection went away.": "因連線斷開而停止。",
  "Checking the server's key": "確認伺服器金鑰",
  "Connecting to {where} for the first time": "首次連線 {where}",
  "This server's key is not known yet. Now is the only moment you can tell whether the other end really is this server.":
    "還不知道此伺服器的金鑰。只有現在才能確認對方是否真的是這台伺服器。",
  "Trust it and connect": "信任並連線",
  "Close the menu": "關閉選單",
  "Add a server": "新增伺服器",
  "Open the menu": "開啟選單",
  "Remote maintenance": "遠端維護",
  "Show": "顯示",
  "Show or hide the agent's column": "顯示或隱藏 Agent 欄",
  "{note} (opens in its own window)": "{note}（在獨立視窗開啟）",
  "Agent settings": "Agent 的設定",
  "Agent settings (model, commands, skills)": "Agent 的設定（模型・命令・技能）",
  "Run across servers (the same goal on several)": "批次執行（對多台伺服器同一目標）",
  "Leave full screen": "離開全螢幕",
  "Full screen": "全螢幕",
  "Record": "錄製",
  "Recording {clock}": "錄製中 {clock}",
  "Disconnect": "斷開",
  "Connect": "連線",
  "Which screen to connect with": "用哪個畫面連線",
  "Connect with {label}": "用 {label} 連線",
  "Not connected": "未連線",
  "Press Connect and the screen appears here.": "按下「連線」，畫面會出現在這裡。",
  "Connecting…": "正在連線…",
  "Signing in and building the screen takes the far end a few seconds, sometimes longer.":
    "對方登入並產生畫面需要數秒到十幾秒。",
  "Hands the agent the session you are looking at (this is what gets sent)":
    "把你正在看的工作階段畫面交給 Agent（傳送時的內容）",
  "Handed to the chat": "已交給對話",
  "Hand to the chat": "交給對話",
  "+ Open a session": "＋ 開啟工作階段",
  "Close {title}": "關閉{title}",
  "No session is open.": "沒有開啟的工作階段。",
  "A session for typing commands becomes available once SSH is filled in.":
    "填入 SSH 後即可使用輸入命令的工作階段。",
  "The screen is already set up and usable now. An agent that looks at the screen and works it will run too.":
    "畫面已設定好，可以立即使用。看畫面並操作的 Agent 也可以運行。",
  "Nothing to connect to has been set.": "尚未設定連線目標。",
  "Fill in a screen (RDP or VNC) or SSH under the connection settings.":
    "請在「連線設定」中填入畫面（RDP / VNC）或 SSH 之一。",
  "Width of the chat": "對話的寬度",
  "Server settings": "伺服器的設定",
  "No servers yet.": "還沒有伺服器。",
  "Register the address of a screen (RDP or VNC) or of SSH, and the screen and the session appear — and the agent can work that server.":
    "登記畫面（RDP / VNC）或 SSH 的位址後，畫面與工作階段就會出現，Agent 也就能操作那台伺服器。",
  "Set up the agent first": "先設定 Agent",
  "Screen + {shell}": "畫面+{shell}",

  // ResourceSection.tsx
  "A written procedure for one kind of work. Only the name and the description are always in view; the agent reads the body only when the work is related. It exists so that something like \"how to look at a 502 on this server\" need not be written out every time.":
    "寫下某項特定工作做法的操作手冊。始終可見的只有名稱與說明，Agent 只在相關工作時才讀取正文。它的用處是：像「在這台伺服器上查看 502 的步驟」這樣的內容，不必每次重寫。",
  "None yet. If there is a procedure you want the agent to know, write it here.":
    "還沒有。如果有想讓 Agent 記住的步驟，寫在這裡。",
  "`skills/<name>/SKILL.md`. The description in the frontmatter is the sentence the agent reads when choosing.":
    "`skills/<名稱>/SKILL.md`。frontmatter 中的 description 就是 Agent 選擇時讀到的句子。",
  "An instruction you use often, under a name. Pick it from the + menu in a conversation and the text lands in the box.":
    "把常用的指示取個名字。從對話的＋選單中選擇後，這裡寫的文字會進入輸入欄。",
  "+ Add a prompt": "＋ 新增提示詞",
  "None yet. If you type the same instruction every time, you can name it and keep it here.":
    "還沒有。如果每次都在輸入同樣的指示，可以取名後留在這裡。",
  "`prompts/<name>.md`. Picked from the + menu, the body lands in the box — you can edit it before sending.":
    "`prompts/<名稱>.md`。從＋選單選擇後，正文會進入輸入欄（傳送前可以修改）。",
  "Code that steps in at the turning points of a run. It can hook just before a command runs, at the start of a session, and so on. It can also give the agent new tools.":
    "在執行的關鍵節點介入的程式碼。可以掛鉤在命令執行前、工作階段開始時等。也可以為 Agent 增加工具。",
  "+ Add an extension": "＋ 新增擴充",
  "None yet. Recording a run, stopping on a condition — that sort of thing is written here.":
    "還沒有。記錄執行、按條件停止之類的內容寫在這裡。",
  "`extensions/<name>.ts`. The events you can hook are listed in Pi's docs/extensions.md.":
    "`extensions/<名稱>.ts`。可用的事件列在 Pi 的 docs/extensions.md 中。",
  "Name (letters, digits and - _ .)": "名稱（英數字與 - _ .）",
  "Create": "產生",
  "Creating…": "產生中…",
  "(no description)": "（無說明）",
  "Let the agent call: {tools}": "讓 Agent 可以呼叫：{tools}",
  "Allow its tools ({tools})": "允許其工具（{tools}）",
  "Open its folder": "開啟所在位置",
  "Contents": "內容",
  "Before you install it": "安裝之前",
  "Commands it uses:": "使用的命令：",
  "{names} are commands this application does not know, or of a kind it will not run. At run time they go to you, or are refused.":
    "{names} 是本應用不認識的命令，或屬於不允許執行的種類。執行時會交給你確認，或被拒絕。",
  "line {line}": "第 {line} 行",
  "This is the result of reading the contents, not something that stops anything running.":
    "這是讀取內容後的結果，不是阻止執行的機制。",
  "An extension is": "擴充是",
  "A skill is": "技能是",
  "something its author can also hide things in. What protects you is the allowlist at run time, the approvals and the record.":
    "作者也可以在其中隱藏內容。真正保護你的是執行時的許可清單、核准與紀錄。",
  "The model is reading it…": "模型正在讀取…",
  "Have the model read it too": "也讓模型讀一遍",
  "Press this and the body of the file is sent to the model you configured.":
    "按下後，此檔案的正文會傳送給你設定的模型。",
  "What the model made of it": "模型讀到的內容",
  "The model says there is nothing worth flagging.": "模型表示沒有值得注意的地方。",
  "This is what {by} made of it. It can be wrong.": "這是 {by} 讀取的結果。可能會讀錯。",
  "Anything the author hid does not show up here either.": "作者隱藏的內容，這裡同樣不會顯示。",
  "What you want kept to on every server and every run. Whatever is written here sits in front of the agent at all times. Keep it short, and only write what can be kept.":
    "希望在任何伺服器、任何執行中都遵守的內容。這裡寫的東西會始終放在 Agent 面前。請寫得簡短，且只寫能夠遵守的事。",
  "Instructions that always apply": "始終生效的指示",
  "yes": "有",
  "none": "無",
  "e.g.\n- Answer in English\n- Before changing anything, say in one line what will change\n- If a service has to be stopped, say why first":
    "例：\n- 用中文回答\n- 變更之前，用一句話說明要改什麼\n- 如果需要停止某個服務，先說明理由",
  "Saved as `AGENTS.md`. Empty it and there are no instructions again.":
    "將儲存為 `AGENTS.md`。留空則回到沒有指示的狀態。",
  "A way of handing out skills, prompts and extensions together. They come from npm or git. Whatever is listed here is prepared by Pi the next time the agent starts.":
    "把技能、提示詞、擴充打包分發的機制。從 npm 或 git 安裝。這裡列出的內容，會在 Agent 下次啟動時由 Pi 準備好。",
  "What is installed": "已安裝的內容",
  "+ Add a package": "＋ 新增套件",
  "Add a package": "新增套件",
  "Where from": "來源",
  "npm:@foo/bar / git:github.com/user/repo / https://… / an absolute path":
    "npm:@foo/bar / git:github.com/user/repo / https://… / 絕對路徑",
  "A package runs with this machine's privileges. An extension is code, and a skill can tell the agent to do anything. Read what is in it before installing somebody else's.":
    "套件以這台工作電腦的權限運行。擴充是程式碼，技能可以指示 Agent 做任何事。安裝別人的東西之前，請先讀內容。",
  "Adding…": "新增中…",
  "Nothing installed yet.": "還沒有安裝。",
  "Only part of it is loaded": "已限定載入的內容",

  // RunsPane.tsx
  "Stopped: too many": "過多而停止",
  "Out of time": "逾時",
  "Still asking": "仍在提問",
  "yesterday": "昨天",
  "Command history": "命令歷史",
  "Screen recordings": "畫面錄製",
  "Write a report": "產生報告",
  "No runs recorded yet.": "還沒有執行紀錄。",
  "Choose one on the left.": "請從左側選擇。",
  "Category unknown": "類別不明",
  "Not run": "未執行",
  "Not one command was run.": "沒有執行任何命令。",
  "The record ends here.": "紀錄到此為止。",
  "Work report": "工作報告",
  "Write a work report": "產生工作報告",
  "From": "開始",
  "To": "結束",
  "Choose the dates and press Create, and you get a report you can hand to the customer.":
    "選擇期間並按下「產生」，就能得到可交給客戶的報告。",
  "Writing it out…": "正在匯出…",
  "Only commands containing this text": "僅包含此文字的命令",
  "Show every output": "展開全部輸出",
  "Collapse every output": "摺疊全部輸出",
  "Write out what is showing": "匯出目前顯示的內容",
  "Write out this list ({count})": "匯出此列表（{count} 條）",
  "Excel, spreadsheets": "Excel・電子試算表",
  "To paste into a report": "貼到報告中",
  "Hand over as it is": "原樣交付",
  "To read in another program": "用其他程式讀取",
  "No command contains that text.": "沒有包含該文字的命令。",
  "None yet. What the agent ran and what you typed in a session both end up here.":
    "還沒有。Agent 執行的命令與你在工作階段中輸入的命令都會留在這裡。",
  "The output was not kept": "未保留輸出",
  "Show the output": "查看輸出",
  "Hide the output": "隱藏輸出",
  "Copy": "複製",
  "Show this run": "查看此次執行",
  "Put it in a session": "放入工作階段",
  "Write out": "匯出",
  "None yet. Recordings made with Record on the screen end up here.": "還沒有。用畫面上的「錄製」拍攝後，會留在這裡。",
  "{width}×{height} · {fps} fps · {parts} parts · {size}":
    "{width}×{height}・{fps} 格/秒・{parts} 段・{size}",
  " · it ends part-way": "・中途結束",
  "Play": "播放",
  "This recording cannot be played.": "無法播放此錄製。",
  "{at} of {total}": "第 {at} / {total} 段",
  "1 part": "1 段",

  // SelectMenu.tsx
  "Filter": "篩選",
  "Nothing found": "找不到",

  // (handed over as data)
  "The reading stopped part way. What is shown here may not be all of it.": "讀取中途被截斷。此處顯示的內容未必是全部。",
  "The open ports could not be read.": "無法讀取已開放的連接埠。",
  "No systemd services — this machine may not use systemd.": "沒有 systemd 服務（可能不是 systemd）。",
  "The firewall settings could not be read.": "無法讀取防火牆的設定。",
  "It starts processes on this machine": "會在本機啟動行程",
  "It reads and writes this machine's files": "會讀寫本機的檔案",
  "It goes out to the network": "會存取網路",
  "It goes out to the network (fetch)": "會存取網路（fetch）",
  "It reads this machine's details": "會讀取本機的資訊",
  "Declared": "已宣告",
  "A command the catalogue does not have, or of a kind that is not run. At run time it goes to you, or is refused":
    "目錄中沒有的命令，或屬於不允許執行的種類。執行時會交給你確認，或被拒絕",
  "It gives the agent this tool": "會為 Agent 增加此工具",
  "This may be somewhere it sends to": "可能是向外傳送的目標",
  "Written down as a reference": "作為參考來源寫在其中",
  "Everything (journal)": "系統整體 (journal)",

  // kits/index.ts

  // kits/catalog.ts
  "Unfamiliar server": "陌生的伺服器",
  "How to work out what a server runs and where it keeps it, without knowing the distribution, the layout, or whether anything was installed by hand.": "在不知道發行版、不知道目錄配置，也不知道有沒有手動安裝過東西的伺服器上，弄清它在跑什麼、東西放在哪裡的方法。",
  "Finding a server's configuration without guessing paths: ask the socket, the binary, the service manager and the package manager, in that order, and search the filesystem last.": "不靠猜路徑來弄清伺服器設定的方法：依序詢問監聽、二進位檔、服務管理員、套件管理員，檔案搜尋放在最後。",
  "Work out what this server runs": "查清這台伺服器在跑什麼",
  "Sockets, binaries, units and packages — no guessed paths": "從監聽、二進位檔、單元、套件入手，不猜路徑",
  "Work out what this server runs and where its configuration lives. Start from what is listening and what owns those sockets, ask each binary where its own configuration is, and check the service manager and the package manager. Do not assume a distribution layout. Tell me what you could not read and why.": "請查清這台伺服器在跑什麼、設定放在哪裡。先從有什麼在監聽、這些監聽歸誰所有開始，再向每個二進位檔詢問它自己的設定在哪，並確認服務管理員和套件管理員。不要預設發行版的目錄配置。讀不到的東西，請連同原因一起告訴我。",
  "Find the logs for what is running": "找出正在執行的服務的日誌",
  "Per-unit journals and the files the daemons have open": "按單元的 journal，以及行程目前開啟的檔案",
  "Find the logs for the services running on this server. Prefer the per-unit journal over hunting for files, and check what the running processes actually have open. Tell me which ones you cannot read.": "請找出這台伺服器上正在執行的服務的日誌。比起到處找檔案，優先用按單元的 journal，並確認正在執行的行程實際開啟了哪些檔案。讀不到的，請告訴我。",
  "Find what was changed from the defaults": "找出被改過的地方",
  "The files somebody edited are the interesting ones": "有人動過的檔案，才是值得看的檔案",
  "Find which configuration files on this server differ from what their packages shipped, and show me the ones that look deliberate. Anything not owned by a package is worth naming too.": "請找出這台伺服器上與套件原始內容不同的設定檔，並把看起來是刻意修改的挑出來給我。不屬於任何套件的東西也請一併列出。",
  "LAMP (WordPress, Apache, MySQL)": "LAMP（WordPress・Apache・MySQL）",
  "When a website is down, slow, or throwing errors: how to work through Apache, MySQL and WordPress.": "網站掛了、變慢、報錯的時候，把 Apache、MySQL、WordPress 過一遍。",
  "Investigating Apache, MySQL and WordPress: where the logs are, how to get at 4xx/5xx, and how to look at a slow page and its database.": "Apache＋MySQL＋WordPress 的排查方法：日誌在哪、怎麼定位 4xx/5xx、慢頁面和資料庫怎麼看。",
  "Look into the 5xx/4xx errors": "排查 5xx/4xx 錯誤",
  "From the access and error logs: when, which URL, and how many": "從存取日誌和錯誤日誌看：什麼時候、哪個 URL、出了多少次",
  "Look into the Apache, PHP-FPM and MySQL errors and get a first idea of what is behind the recent 5xx/4xx. Start from whether the services are alive and what the latest log lines say, and if you need counts, copy the large logs across and total them up here. Do not copy out settings or passwords.": "請排查 Apache、PHP-FPM、MySQL 的錯誤，初步判斷最近增多的 5xx/4xx 是什麼原因。先看服務是否存活和最近的日誌，如果需要統計次數，就把大日誌複製到工作區再彙總。不要抄出設定值和密碼。",
  "Find out why the site is slow": "找出網站慢的原因",
  "Narrow it down from load, processes and MySQL's state": "從負載、行程和 MySQL 的狀態縮小範圍",
  "Find out why the site is answering slowly. Start with the load and which of Apache, PHP-FPM and MySQL is eating the machine, then get a first idea of which pages or queries are slow.": "請查清網站回應慢的原因。先看負載，以及 Apache、PHP-FPM、MySQL 中是哪個在吃資源，再初步判斷哪些頁面或查詢慢。",
  "Check that nothing has fallen over": "檢查有沒有服務掛掉",
  "Apache, MySQL and PHP-FPM: alive, and any recent crash": "確認 Apache、MySQL、PHP-FPM 是否存活，以及最近有沒有崩潰",
  "Check whether Apache, MySQL (or MariaDB) and PHP-FPM are alive and whether any of them has crashed or restarted recently, and if something is wrong, get a first idea of why.": "請檢查 Apache、MySQL（或 MariaDB）、PHP-FPM 是否存活，以及最近有沒有崩潰或重新啟動；如果有異常，請初步判斷原因。",
  "Check the WordPress configuration": "確認 WordPress 的設定",
  "wp-config and plugin errors (secrets stay hidden)": "確認 wp-config 和外掛引起的錯誤（機密仍然遮蔽）",
  "Check how WordPress is configured. Look at the settings in wp-config (which database it talks to, debugging, caching) and at the PHP errors from plugins and themes in error.log. You may read passwords and authentication keys, but do not copy them out.": "請確認 WordPress 的組成。看 wp-config 中的設定（連的是哪個資料庫、除錯、快取），以及 error.log 裡由外掛和佈景主題引起的 PHP 錯誤。密碼和認證金鑰可以讀，但不要抄出來。",
  "Nginx (web server, reverse proxy)": "Nginx（Web・反向代理）",
  "Nginx returning 502/504, a setting that has no effect, an expired certificate — where to look.": "Nginx 回傳 502/504、設定不生效、憑證過期——這些情況怎麼查。",
  "Investigating Nginx: checking the configuration (nginx -t), looking upstream for a 502/504, the access and error logs, and certificate expiry.": "Nginx 的排查方法：設定檢查（nginx -t）、502/504 時怎麼看上游、存取/錯誤日誌、憑證有效期。",
  "Look into the 502/504": "排查 502/504",
  "Narrow it down from error.log and whether the upstream is alive": "從 error.log 和上游是否存活來縮小範圍",
  "Look into why Nginx is returning 502/504. Read the upstream lines in error.log and get a first idea of whether the PHP-FPM or application behind it is down or timing out.": "請查清 Nginx 回傳 502/504 的原因。看 error.log 中 upstream 的行，初步判斷後面的 PHP-FPM 或應用是不是掛了、或者逾時了。",
  "Check the configuration": "確認設定",
  "nginx -t, and what is actually in effect": "nginx -t，以及實際生效的設定",
  "Check the Nginx configuration. Start with nginx -t for validity, then work out which server and location the Host and path in question actually match.": "請確認 Nginx 的設定。先用 nginx -t 看是否有效，再確認出問題的 Host 和路徑實際命中了哪個 server/location。",
  "Check when the certificate expires": "確認憑證的有效期",
  "TLS expiry, the chain, and whether the name matches": "看 TLS 憑證的有效期、憑證鏈、網域是否相符",
  "Check when the TLS certificate this Nginx uses expires, and whether there is anything wrong with its chain or with the name it is issued for.": "請確認這個 Nginx 使用的 TLS 憑證的有效期，以及憑證鏈和網域是否有問題。",
  "Total up the access log": "彙總存取日誌",
  "Counts by status and by URL, to see what stands out": "按狀態碼和 URL 統計次數，看有沒有異常",
  "From the Nginx access log, get the shape of the traffic by status and by URL, and find anything that stands out. Copy large logs across and total them up here.": "請從 Nginx 的存取日誌中，按狀態碼和 URL 掌握次數的趨勢，看有沒有異常。大日誌請複製到工作區再彙總。",
  "Docker (containers, Compose)": "Docker（容器・Compose）",
  "A container that dies, restarts in a loop, or eats the disk — where to look in a container setup.": "容器掛掉、反覆重啟、吃掉磁碟——容器環境怎麼查。",
  "Investigating Docker and Compose: whether containers are alive and restarting, following their logs, resources and disk, and reading a Compose setup.": "Docker/Compose 的排查方法：容器是否存活與重啟、怎麼追日誌、資源與磁碟、Compose 的組成。",
  "Look into a container that keeps dying": "排查反覆掛掉的容器",
  "Exit code, restart count and logs — including OOM": "從結束碼、重啟次數、日誌縮小範圍（也看 OOM）",
  "Look into the containers that are dying or restarting in a loop. Use docker ps -a and docker inspect for the exit code, RestartCount and OOMKilled, and get a first idea of the cause from the logs.": "請排查那些掛掉或反覆重啟的容器。用 docker ps -a 和 docker inspect 看結束碼、RestartCount、OOMKilled，再從日誌初步判斷原因。",
  "List the state of the containers": "列出容器的狀態",
  "Which are alive, and what they are using": "哪些還活著，以及它們各自吃了多少",
  "List which containers are running and which are stopped, and summarise the state of each and what it is using (CPU, memory).": "請列出正在執行和已停止的容器，並彙總各自的狀態與資源消耗（CPU、記憶體）。",
  "Find what is eating the disk": "找出吃掉磁碟的東西",
  "The breakdown across images, containers and volumes": "列出映像檔、容器、磁碟區各自佔用的容量",
  "Find out what is making Docker eat the disk. Break it down with docker system df -v and show me what is using the space. Do not delete anything.": "請查清 Docker 吃掉磁碟的原因。用 docker system df -v 列出明細，指出是什麼在佔用容量。不要執行刪除操作。",
  "Check the Compose setup": "確認 Compose 的組成",
  "Services, ports and dependencies from the compose file (secrets stay hidden)": "從 compose 檔讀服務、連接埠、相依（機密仍然遮蔽）",
  "Check the Docker Compose setup on this machine. Read the services, ports and dependencies from the compose file. Do not copy out environment values or passwords.": "請確認這台機器上 Docker Compose 的組成。從 compose 檔讀出服務、連接埠和相依關係。不要抄出環境變數和密碼。",
  "PostgreSQL": "PostgreSQL",
  "Cannot connect, slow, or eating the disk — where to look in PostgreSQL.": "連不上、變慢、吃磁碟——PostgreSQL 怎麼查。",
  "Investigating PostgreSQL: whether it is alive and reachable, slow queries and waits, connection counts, disk and logs.": "PostgreSQL 的排查方法：是否存活與能否連線、慢查詢與等待、連線數、磁碟與日誌。",
  "Find out why it will not connect": "查清連不上的原因",
  "The service, the port, pg_hba and the connection limit": "從服務、連接埠、pg_hba、連線數上限縮小範圍",
  "Find out why PostgreSQL will not accept a connection. Look at whether the service is alive and on its port, at the authentication in pg_hba.conf, and at the connection limit. Ask me for the password.": "請查清 PostgreSQL 無法接受連線的原因。看服務是否存活、是否在監聽連接埠、pg_hba.conf 的認證，以及連線數上限。密碼請向操作者確認。",
  "Look into slow queries and waits": "排查慢查詢和等待",
  "The heavy and waiting queries in pg_stat_activity": "從 pg_stat_activity 看重的和正在等待的查詢",
  "Find out why PostgreSQL is slow. Use pg_stat_activity for long-running queries, waits and locks, and narrow down where the slowness comes from.": "請查清 PostgreSQL 慢的原因。用 pg_stat_activity 看長時間執行的查詢、等待和鎖，縮小慢的來源。",
  "Check the connection count": "確認連線數",
  "Connections by state, and idle in transaction": "按狀態看連線數，以及 idle in transaction",
  "Check PostgreSQL's connections by state and tell me whether anything is wrong — idle in transaction piling up, for instance.": "請按狀態確認 PostgreSQL 的連線數，看有沒有異常，例如 idle in transaction 是不是堆積了。",
  "Look into the disk usage": "排查磁碟佔用",
  "Size per database, and whether WAL is piling up": "確認各資料庫的大小，以及 WAL 是否堆積",
  "Find out how much disk PostgreSQL is using. Check the size of each database, whether WAL is piling up, and how much room is left on the host.": "請查清 PostgreSQL 用了多少磁碟。確認各資料庫的大小、WAL 有沒有堆積，以及主機還剩多少空間。",

  // pi.ts, files/session.ts, windows.ts, agent/secrets.ts
  "Pi does not know a service called {name}.": "Pi 不認識名為 {name} 的服務。",
  "That skill cannot be read.": "讀不了這個技能。",
  "The agent's runtime (Pi) could not be loaded: {detail}": "無法載入 Agent 的執行基座（Pi）：{detail}",
  "{model} from {provider} could not be used. In the agent settings, sign in to that service or enter an API key for it.": "無法使用 {provider} 的 {model}。請在 Agent 設定的模型裡登入該服務，或填入 API 金鑰。",
  "Pi could not resolve the model “{name}”.": "Pi 無法解析模型「{name}」。",
  "({count} value that looked like a secret was hidden. The value itself went neither to the model nor into the record — open a session if you need to see it.)|({count} values that looked like secrets were hidden. The values themselves went neither to the model nor into the record — open a session if you need to see them.)": "（遮蔽了 {count} 處看起來像機密的值。真正的值既沒有交給模型，也沒有寫入紀錄。需要的話請在工作階段裡確認。）",
  "{path} cannot be opened: {reason}": "打不開 {path}：{reason}",
  "the home directory": "主目錄",
  "{path} cannot be read: {reason}": "讀不了 {path}：{reason}",
  "SFTP is switched off on this server (the sshd Subsystem sftp line). SSH itself is working.": "這台伺服器上 SFTP 被關閉了（sshd 的 Subsystem sftp）。SSH 本身是通的。",
  "SFTP will not open: {reason}": "打不開 SFTP：{reason}",
  "Task Scheduler": "工作排程器",
  "Windows Defender Firewall": "Windows Defender 防火牆",
  "{profile}: {state} (inbound defaults to {inbound})": "{profile}：{state}（輸入預設 {inbound}）",

  // agent/resources.ts, agent/riskHint.ts
  "A name may use letters, digits and - _ . only, up to 63 characters (Pi looks for the file under this name).": "名稱只能用英數字和 - _ .，最多 63 個字元（Pi 會按這個名稱找檔案）。",
  "When to use it and what it does. The agent reads this line to choose.": "什麼時候用、做什麼。Agent 會讀這一行來選擇。",
  "Steps": "步驟",
  "What this prompt does": "這個提示做什麼",
  "Name here the tools this extension registers, separated by spaces.": "在這裡寫下這個擴充要註冊的道具名稱（用空格分隔）。",
  "For example: // @tools recall remember": "例如： // @tools recall remember",
  "Only the names written here reach the agent, and only once the settings allow them.": "只有寫在這裡的名稱，並且在設定中允許之後，才會交給 Agent。",
  "Steps in at the points of a run. The events you can use are in Pi's docs/extensions.md.": "在執行的關鍵節點介入。可用的事件見 Pi 的 docs/extensions.md。",
  "For example: keep a record, or stop the run when something holds": "例如：留下紀錄，或在某些條件下停止",
  "To reach an outside service, register a tool here.": "要連接外部服務的話，在這裡註冊道具。",
  "Write it as npm:name, git:host/user/repository, https://… or an absolute path.": "請寫成 npm:名稱 / git:主機/使用者/儲存庫 / https://… / 絕對路徑 之一。",
  "This may be able to do more than read.": "可能不只是讀取。",

  // RemoteAgentChat.tsx

  // agent/session.ts, RemoteAgentChat.tsx

  // AgentSettingsForm.tsx, RunsPane.tsx (the trace)
  "What is kept of each run":
    "每次執行要保留的內容",
  "Keep the whole conversation with the model":
    "保留與模型的全部往來",
  "Everything sent to the model and everything it said, run by run, beside the run's record on this machine. Nothing is sent anywhere for it. Open a run under \"Runs\" to write one out. A long run is a few hundred kilobytes; a very long one, a few megabytes.":
    "把發給模型的內容和模型回傳的內容，按每次執行保存在執行紀錄旁邊。不會為此向外傳送任何東西。要匯出時，請在「執行紀錄」中開啟某次執行。較長的執行約幾百 KB，非常長的也就幾 MB。",
  "What the model saw":
    "模型看到的內容",
  "Everything sent to the model and everything it said, this run":
    "本次執行發給模型的內容和模型回傳的內容的全部",
  "Write it out ({size})":
    "匯出（{size}）",
  "The prompt and every turn, to read":
    "提示與每次往來，供閱讀",
  "Every event as it arrived":
    "原樣保留每個事件",
  "The report was written.": "已寫好報告。",
  "Write the report": "產生報告",
  "It has not been read yet: connect to this server, or press Read again.":
    "還沒有讀取到。請連線這台伺服器，或按「重新讀取」。",

  // PluginsSection.tsx, plugins/index.ts
  "There is no plugin called {id}.":
    "沒有這個外掛：{id}",
  "Plugins":
    "外掛",
  "Plugins available":
    "可用的外掛",
  "No plugins.":
    "沒有外掛。",
  "Installed, the knowledge above is always in the agent's view — the bodies are read only when needed. Removed, only what this plugin installed is deleted; anything you wrote yourself stays.":
    "裝上後，上面的知識會一直在 Agent 的視野裡（內文只在需要時讀取）。解除安裝時只刪除這個外掛裝的東西，你自己寫的會保留。",
  "Plugins ship inside this application. Installing or removing one sends nothing over the network. What a plugin installed can also be seen under Skills.":
    "外掛隨本應用一同發布。裝上或解除安裝都不會向外傳送任何東西。外掛裝入的內容也可以在「技能」裡看到。",
  "Nothing to put in here yet. A plugin brings investigations you can start with one press, and a sub-agent or a prompt appears here once you make one.":
    "這裡還沒有可放的東西。裝上外掛後，這裡會列出一按即可開始的調查。建立了 Agent 或提示後，也會出現在這裡。",
  "Look at the plugins":
    "查看外掛",
  "\"{name}\" looks like a fit for this server. Install it and the usual investigations are one click away.":
    "「{name}」看起來適合這台伺服器。裝上後，常見的調查一按即可。",
  "What to ask for when this is picked from the ＋ menu. Leave it out and it is knowledge only.":
    "從 ＋ 選單選中時要提出的請求。不寫的話，就只作為知識使用。",
  "The skills it installs": "會裝入的技能",
  "in the ＋ menu": "會出現在 ＋ 選單",
  "`skills/<name>/SKILL.md`. The description in the frontmatter is the sentence the agent reads when choosing; add a `goal:` and the skill also appears in a conversation's ＋ menu, putting that line in the box.":
    "`skills/<名稱>/SKILL.md`。frontmatter 中的 description 是 Agent 選擇時讀的那句話。加上 `goal:`，這個技能還會出現在對話的 ＋ 選單裡，把那句話放進輸入框。",

  // plugins (adding one), resources (importing a skill)
  "This folder has no plugin.json.":
    "這個資料夾裡沒有 plugin.json。",
  "A plugin that ships with the application is already called {id}.":
    "內建外掛裡已經有叫 {id} 的了。",
  "This folder has no skills directory.":
    "這個資料夾裡沒有 skills 目錄。",
  "There is not one skill in this folder.":
    "這個資料夾裡一個技能都沒有。",
  "A plugin may hold up to {count} skills.":
    "一個外掛最多放 {count} 個技能。",
  "{name} has no SKILL.md.":
    "{name} 裡沒有 SKILL.md。",
  "{name} is too large to read as a skill.":
    "{name} 太大了，無法作為技能讀取。",
  "A plugin that ships with the application cannot be forgotten.":
    "內建外掛無法被移出清單。",
  "Choose the folder that holds plugin.json":
    "請選擇含有 plugin.json 的資料夾",
  "There is no SKILL.md in that folder.":
    "那個資料夾裡沒有 SKILL.md。",
  "Choose a SKILL.md, or the folder that holds one":
    "請選擇 SKILL.md，或含有它的資料夾",
  "Reading…":
    "讀取中…",
  "Add a plugin":
    "新增外掛",
  "Nothing is installed by adding it: the skills are written when you press Install. Read them first — a skill is text the agent will act on.":
    "只是新增還不會裝入任何東西，技能是在按下「安裝」時才寫入的。請先讀一讀內容——技能是 Agent 會照著做的文字。",
  "+ From a file":
    "＋ 從檔案新增",
  "+ From a folder": "＋ 從資料夾",
  "+ Write a new one": "＋ 新寫一個",
  "Show or hide the screen": "顯示或隱藏畫面",
  "Show or hide the session": "顯示或隱藏工作階段",
  "{count} note|{count} notes": "已知 {count} 條",
  "Written down in the logbook: {title}": "已寫入台帳：{title}",

  // KartePane.tsx (what earlier runs established)
  "What is known about this server":
    "關於這台伺服器已知的內容",
  "What earlier runs established":
    "以往查明的內容",
  "Nothing yet. As an investigation works something out, it writes it here — and the next run is handed it instead of finding it again.":
    "還沒有內容。調查弄清什麼之後，Agent 會寫在這裡。下次執行會拿到它，不必再查一遍。",
  "Correct it":
    "修改",
  "The next run is handed what you save here.":
    "在這裡儲存的內容會交給下次執行。",
  "{count} of {most} kept. Past that, the oldest goes.":
    "最多保留 {most} 條（目前 {count} 條）。超過後從最舊的開始丟棄。",
  "Save as a file":
    "儲存為檔案",
  "The conversation was getting long, so what came before was summarised. What was written down in the logbook is kept in full.":
    "對話變長了，之前的部分已被總結。寫入台帳的內容原樣保留。",
  "Start a new conversation to change the model.":
    "要更換模型，請開始新的對話。",
  "Start a new conversation to change this.":
    "要更改，請開始新的對話。",

  // RemoteWorkspace.tsx (the clipboard)
  "Clipboard":
    "剪貼簿",
  "What copy and paste has to work with on this server":
    "在這台伺服器上複製貼上的狀態",
  "On this machine":
    "這台機器上的內容",
  "Nothing is copied.":
    "沒有複製任何內容。",
  "To this server":
    "發往這台伺服器",
  "The clipboard channel is not open.":
    "剪貼簿通道沒有開啟。",
  "Offered, and the server took it at {when}.":
    "已提供，伺服器在 {when} 取走了。",
  "Offered at {when}. The server has not come for it — paste over there to pull it.":
    "已在 {when} 提供。伺服器還沒有來取（在那邊貼上時才會來取）。",
  "Nothing has been offered yet.":
    "還沒有提供任何內容。",
  "From this server":
    "來自這台伺服器的內容",
  "Offer it again":
    "再傳送一次",
  "Type it in":
    "作為文字鍵入",
  "Type it in — it goes where the cursor is":
    "鍵入（會進入游標所在處）",
  "Typing stops at 2000 characters.":
    "鍵入最多 2000 個字元。",
};
