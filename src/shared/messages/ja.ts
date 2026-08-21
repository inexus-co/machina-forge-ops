/**
 * Japanese.
 *
 * The key is the English sentence exactly as it stands in the source — see `shared/i18n.ts` for
 * why. A sentence absent here is shown in English, so an unfinished translation is visibly
 * unfinished rather than broken, and `i18n.test.ts` fails naming anything the screens ask for
 * that this file cannot answer.
 *
 * Two forms separated by `|` are singular and plural, chosen on `count`. `{name}` is filled in by
 * the caller and has to survive translation — a placeholder dropped here goes missing on screen.
 *
 * This application was written in Japanese and its operators are Japanese; this file is the
 * one most people actually read on screen. The wording rules are in CLAUDE.md — the
 * operator's vocabulary, not the dictionary's.
 */

import type { Messages } from "../i18n";

export const JA: Messages = {

  // index.ts
  "Machina Forge Ops": "マキナ・フォージ Ops",

  // controller.ts
  "That agent is not registered.": "そのエージェントは登録されていません。",
  "No model is registered for {name} to use.": "{name} が使うモデルが登録されていません。",
  "this machine": "このPC",
  "That server is not registered.": "そのサーバは登録されていません。",
  "No model is registered. Add one in the settings.": "モデルが登録されていません。全体の設定でモデルを追加してください。",
  "\"{name}\" has no address and no model name.": "「{name}」に接続先とモデル名が入っていません。",
  "\"{name}\" has no API key set.": "「{name}」のAPIキーが設定されていません。",
  "This machine can isolate. Running without isolation is not needed.":
    "このPCには隔離の仕組みがあります。隔離なしでの実行は必要ありません。",
  "That file cannot be opened.": "そのファイルは開けません。",
  "{name}-work-report.md": "{name}-作業報告.md",

  // diff.ts
  "@@ {count} unchanged lines @@": "@@ 変更のない {count} 行 @@",

  // facts.ts
  "This server's state could not be read.": "このサーバの状態を読めませんでした。",
  "{days}d": "{days}日",
  "{hours}h": "{hours}時間",
  "{minutes}m": "{minutes}分",
  "OS: {os}": "OS：{os}",
  "Up: {uptime}": "稼働：{uptime}",
  "Load {load}": "負荷 {load}",
  "{cores} cores": "{cores}コア",
  "CPU: {detail}": "CPU：{detail}",
  " (swap {used} / {total})": "（スワップ {used} / {total}）",
  "Memory: {used} of {total} used{swap}": "メモリ：{used} / {total} 使用{swap}",
  " (over 80%)": "※80%超",
  "Disks: {disks}": "ディスク：{disks}",
  "{count} failed ({names}{more}), ": "失敗 {count}（{names}{more}）、",
  " and more": " ほか",
  "Services: {failed}{active} of {total} running": "サービス：{failed}稼働 {active} / {total}",
  "Containers: {running} running{names}{stopped}": "コンテナ：稼働 {running}{names}{stopped}",
  ", {count} stopped": " 停止 {count}",
  "Ports reachable from outside: {ports}{more}": "外から届くポート：{ports}{more}",
  "firewall: {kind} {state}": "firewall：{kind} {state}",
  "on": "有効",
  "off": "無効",
  " ({count} security)": "（セキュリティ {count}）",
  "  restart needed": "　再起動が必要",
  "Updates: {count}{security}{reboot}": "更新：{count}件{security}{reboot}",
  "Could not be read: {notes}": "読めなかったもの：{notes}",
  "[State]": "【状態】",
  "[Inventory]": "【構成】",
  "Services in failure: {names}": "失敗中のサービス：{names}",
  "Every listening port:": "すべての待受ポート：",
  " (reachable from outside)": "（外から届く）",
  " (this machine only)": "（このマシン内のみ）",
  "Scheduled jobs:": "定期実行：",
  "Images:": "イメージ：",
  "Nothing could be read.": "読み取れた情報がありません。",

  // policy.ts
  "The command is empty.": "コマンドが空です。",
  "The command is too long (up to {max} characters).": "コマンドが長すぎます（{max}文字まで）。",
  "{what} cannot be used. Write one command on one line. Anything needing a pipe or a redirect is run by a person.":
    "{what} は使えません。1行に1つのコマンドだけを書いてください。パイプやリダイレクトが要る処理は、人が実行します。",
  "This agent ({name}) is not allowed sudo.": "このAgent（{name}）には sudo が許可されていません。",
  "sudo {option} has no value.": "sudo {option} に値がありません。",
  "sudo {option} cannot be used.": "sudo の {option} は使えません。",
  "There is no command after sudo.": "sudo のあとにコマンドがありません。",
  "Write the command by name rather than by path ({name}).": "パスではなくコマンド名で書いてください（{name}）。",
  "{program} is not on this agent's list ({name}). It may use: {allowed}":
    "{program} はこのAgent（{name}）の許可リストにありません。使えるのは {allowed} です。",
  "sudo is confirmed every time.": "sudo は毎回確認します。",
  "{program} can be impossible to undo.": "{program} は取り返しがつかない場合があります。",
  "It points at a device.": "デバイスを指しています。",
  "{name} may run {program} on its own only as: {verbs}":
    "{name} が自動で実行してよいのは {program} {verbs} だけです。",
  "{program} with no arguments. This list names the verbs it may use.":
    "{program} を引数なしで実行します。この許可リストは動詞を指定しています。",
  "{name} does not let {program} run on its own.": "{name} は {program} を自動実行の対象にしていません。",
  "{program} is refused by {name}. Find another way.": "{program} は{name}で禁止されています。別の手を考えてください。",
  "{program} is a kind of command that is never run — {summary}. Find another way.":
    "{program} は実行させない種類のコマンドです — {summary}。別の手を考えてください。",
  "{program} cannot be run on the server. Copy what you need across with fetch_log or read_file and work on it in run_local, where it is isolated.":
    "{program} は対象サーバでは実行できません。必要なデータは fetch_log か read_file で作業場に写し、run_local（隔離）で処理してください。",
  "{program} {verb} can be impossible to undo.": "{program} {verb} は取り返しがつかない場合があります。",
  "{program} {flag} can be impossible to undo.": "{program} {flag} は取り返しがつかない場合があります。",
  "This reads the whole machine, end to end. It takes time, and it can slow down whatever that server is for.":
    "サーバ全体を端から読みます。時間がかかり、動いているものに響くことがあります。",
  "It may run on its own only as: {program} {verbs}": "自動で実行できるのは {program} {verbs} だけです。",
  "{program} is set to be confirmed every time.": "{program} は毎回確認する決まりです。",
  "This agent is set to confirm reads as well.": "このAgentは読み取りも確認する設定です。",
  "It may run on its own only as a read: {program} {verbs}":
    "自動で実行できるのは {program} の読み取り（{verbs}）だけです。",
  "{program} can change the server.": "{program} はサーバを変えられるコマンドです。",
  "{program} is known here, but nobody has judged yet whether it reads or writes.":
    "{program} は把握していますが、まだ読み書きの判断をしていません。",
  "Nothing has been decided about {program} yet.": "{program} はまだ扱いが決まっていません。",

  // prompt.ts
  "notes": "メモあり",
  "{count} handover|{count} handovers": "申し送り{count}件",
  "{count} lines of facts": "事実の要約{count}行",
  "the facts could not be read": "事実は読めませんでした",
  "nothing": "情報なし",
  "Handed over the logbook: {summary}": "台帳を渡しました：{summary}",

  // report.ts
  "Finished": "完了しました",
  "Stopped": "停止",
  "Error": "エラー",
  "Timed out": "時間切れ",
  "Waiting for an answer": "確認待ち",
  "Hit the limit": "上限",
  "not carried out: {reason}": "実施せず：{reason}",
  "Fetched a log: {what}": "ログの取得：{what}",
  "Fetched a file: {what}": "ファイルの取得：{what}",
  "Ran a supporting task": "補助作業を実行",
  "failed: {reason}": "失敗：{reason}",
  "timed out": "時間切れ",
  "run": "実行",
  "exit code {code}": "終了コード {code}",
  "(no goal was written)": "（目的の記載なし）",
  "Not finished": "未完了",
  "Result": "結果",
  "What was done": "実施内容",
  "Period: {from} to {to}": "対象期間：{from} 〜 {to}",
  "the beginning": "最初",
  "now": "現在",
  "{host} — work report": "{host} 作業報告",
  "Written: {when}": "作成日時：{when}",
  "Runs: {count}": "実行数：{count}",
  "There were no runs in this period.": "この期間に実行はありませんでした。",
  "Handovers": "申し送り",

  // resourcesController.ts
  "Catalogue": "カタログ",
  "Not one model is registered. Register one first.": "モデルが1つも登録されていません。先にモデルを登録してください。",
  "Cancelled.": "やめました。",
  "Permission received. Finishing up…": "許可を受け取りました。仕上げています…",

  // review.ts
  "The model's answer was not JSON.": "モデルの返答がJSONではありませんでした。",
  "The model's answer could not be read.": "モデルの返答を読めませんでした。",
  "The model returned no summary.": "モデルが要約を返しませんでした。",
  "The model could not be asked to read it: {reason}": "モデルに読ませられませんでした：{reason}",

  // docker.ts
  "…(cut: too long)": "…（長すぎるため打ち切り）",
  "The container could not be started: {reason}": "コンテナを起動できませんでした：{reason}",

  // serverContext.ts
  "That is not a valid host id: {id}": "不正なホストIDです：{id}",

  // session.ts
  "It is already running.": "すでに実行中です。",
  "read the make-up and state again": "素性と状態をもう一度読む",
  "Send a goal first.": "先に目標を送ってください。",
  "That did not reach the agent: {reason}": "その言葉はエージェントに届きませんでした：{reason}",
  "Finished.": "終わりました。",
  "Handed over {title}'s screen ({lines} lines).": "{title} の画面（{lines}行）を渡しました。",
  "It cannot be cleared while running. Stop it first.": "実行中は消せません。先に停止してください。",
  "From now on, {what} will not be used on this server.": "今後、このサーバでは {what} を使いません。",
  "For this conversation, {what} will not be used.": "この会話の間、{what} を使いません。",
  "From now on, {what} runs on its own on this server.": "今後、このサーバでは {what} を自動で実行します。",
  "For this conversation, {what} runs on its own.": "この会話の間、{what} を自動で実行します。",
  "Stopped by you": "停止しました",
  "Used the extension's tool {name}.": "拡張の道具 {name} を使いました。",
  "A file outside the working directory cannot be saved.": "作業ディレクトリの外のファイルは保存できません。",
  "That is not a file.": "ファイルではありません。",
  "Handed to {name}: {task}": "{name} に任せました：{task}",
  "{name} has reported back.": "{name} から報告がありました。",
  "This result was left in the handover.": "この結果を申し送りに残しました。",

  // store.ts
  "Model": "モデル",
  "not named": "指定なし",
  "Settings": "設定",

  // commandRunner.ts
  "The command could not be started: {reason}": "コマンドを開始できません：{reason}",

  // controller.ts
  "A host name cannot contain URL punctuation.": "ホスト名にはURL記号を含められません。",
  "Session": "セッション",
  "Enter the password.": "パスワードを入力してください。",
  "No SSH is set up for this server.": "このサーバにSSHの設定がありません。",
  "Check this server's key first.": "先にこのサーバの鍵を確認してください。",
  "No key file has been chosen.": "鍵ファイルが選ばれていません。",
  "The key file cannot be read: {path}": "鍵ファイルを読めません：{path}",
  "Session {n}": "セッション{n}",
  "No session is open for this server.": "このサーバのセッションが開いていません。",
  "Choose a private key": "秘密鍵を選ぶ",
  "Choose": "選ぶ",
  "No RDP is set up for this server.": "このサーバにRDPの設定がありません。",
  "This server is connected on the VNC screen. Disconnect that first.":
    "このサーバはVNCの画面につながっています。先に切断してください。",
  "No screen (VNC) is set up for this server.": "このサーバに画面（VNC）の設定がありません。",
  "This server is connected on the RDP screen. Disconnect that first.":
    "このサーバはRDPの画面につながっています。先に切断してください。",
  "Choose the files to send": "送るファイルを選ぶ",
  "Send": "送信する",
  "Choose where to save": "保存先を選ぶ",
  "Save here": "ここに保存",
  "Servers": "サーバ",

  // export.ts
  "CSV (spreadsheet)": "CSV（表計算）",
  "Markdown (report)": "Markdown（報告書）",
  "When": "日時",
  "Who": "実行者",
  "Command": "コマンド",
  "Output": "出力",
  "# Command history — {host}": "# コマンド履歴 — {host}",
  "Written out: {when}": "書き出し: {when}",
  "## Output": "## 出力",
  "Command history — {host}": "コマンド履歴 — {host}",
  "Written out: {when} · {count} rows": "書き出し: {when}・{count}件",
  "command-history_{host}_{stamp}": "コマンド履歴_{host}_{stamp}",
  "Write out the command history": "コマンド履歴の書き出し",

  // hostKeys.ts
  "This server's key is not the one recorded. Either {where} was rebuilt, or it is a different server. Recorded {expected} / now {found}. If you rebuilt it, forget this server's key in the settings and then connect.":
    "このサーバの鍵が前回と違います。{where} は作り直されたか、別のサーバです。前回 {expected} / 今回 {found}。作り直したのなら、設定でこのサーバの鍵を忘れさせてから接続してください。",
  "The key at {where} was not trusted.": "{where} の鍵を信頼しませんでした。",

  // controller.ts
  "This server's reading was too long and stopped part way.": "このサーバの読み取りが長すぎて、途中で切れました。",
  "This server's make-up cannot be read — it appears to be neither Linux nor Windows.":
    "このサーバの内容を読めません。LinuxでもWindowsでもないようです。",
  "That log cannot be opened.": "そのログは開けません。",
  "The log cannot be opened: {reason}": "ログを開けません：{reason}",

  // jump.ts
  "Jump server: {reason}": "踏み台：{reason}",
  "The jump server cannot reach {where}: {reason}": "踏み台から {where} へ繋げません：{reason}",

  // wayIn.ts (the providers' table), tunnel.ts, and the host form's tabs
  "Screen": "画面",
  "SSH": "SSH",
  "RDP and VNC": "RDP と VNC",
  "The account, the key, tmux": "アカウント・鍵・tmux",
  "When it cannot be reached directly": "直接つながらないとき",
  "Go in through another server": "別のサーバーを通って入る",
  "Straight to an address": "住所を書いて直接つなぐ",
  "Machine name": "機械の名前",
  "A command that ends in a shell": "シェルにたどり着くコマンド",
  "It runs on this machine, as you. What comes back has to be a shell — the command is not given one, so a pipe or a semicolon here is a character, not a second command.":
    "この機械で、あなたとして実行します。返ってくるものがシェルである必要があります。コマンドにシェルは与えないので、ここに書いたパイプやセミコロンは、ただの文字です。",
  "A provider's command runs on this machine, as you, with the credentials you already use with them, and what comes back is a shell — so there is no account, no key and no host key here, and no files panel either. A jump server is not used as well.":
    "事業者のコマンドは、この機械で、あなたとして、その事業者でいつも使っている資格情報のまま動きます。返ってくるのはシェルなので、アカウントも鍵もサーバーの鍵の確認もここにはありません。ファイルの画面も使えません。踏み台は、これと一緒には使いません。",
  "Files are not available on a server reached by the provider's own command: that way in gives a shell, and file transfer needs SSH.":
    "事業者のコマンドで入ったサーバーでは、ファイルの画面は使えません。返ってくるのはシェルで、ファイルの受け渡しには SSH が要ります。",
  "{label} (only if needed)": "{label}（必要なときだけ）",
  "Fill in {label} for the way in.": "入口の「{label}」を埋めてください。",
  "This server's way in is not filled in.": "このサーバーの入口が埋まっていません。",
  "{program} is not installed on this machine, or is not on the PATH.":
    "{program} がこの機械に入っていないか、PATH にありません。",
  "{program} said: {said}": "{program} からの返事：{said}",
  "It ended without saying why.": "理由を言わずに終わりました。",
  "The shell on the other end ended: {reason}": "向こう側のシェルが終わりました：{reason}",
  "The way in could not be opened: {reason}": "入口を開けられませんでした：{reason}",
  "The way in did not open in time: {reason}": "入口が時間内に開きませんでした：{reason}",
  "Instance ID": "インスタンス ID",
  "Region": "リージョン",
  "Profile": "プロファイル",
  "Instance name": "インスタンス名",
  "Zone": "ゾーン",
  "Project": "プロジェクト",
  "Resource group": "リソースグループ",
  "Something else": "そのほか",


  // fileTransfer.ts (how a file gets across) and its tab
  "Saved.": "保存しました。",
  "File transfer": "ファイル転送",
  "For the ones too big for the connection": "回線に載らない大きさのとき",
  "Fill in {label} for file transfer.": "ファイル転送の「{label}」を埋めてください。",
  "Straight down the connection": "そのまま回線で運ぶ",
  "Over SSH that is SFTP. Over a shell handed back by a provider's command there is no SFTP, so the file travels as text down the same stream — which suits a configuration file and not a database dump.":
    "SSH なら SFTP です。事業者のコマンドで返ってきたシェルには SFTP が無いので、同じ流れに文字として載せて運びます。設定ファイルには向きますが、データベースのダンプには向きません。",
  "Where to leave it": "置き場所",
  "Both machines need the AWS CLI and permission for that prefix — the server's from the role its instance already has, yours from the profile you already use.":
    "両方の機械に AWS CLI と、その場所への権限が要ります。サーバー側はインスタンスにもともと付いているロールから、こちら側はいつも使っているプロファイルから。",
  "Both machines need the Google Cloud CLI and permission for that prefix.":
    "両方の機械に Google Cloud CLI と、その場所への権限が要ります。",
  "Storage account": "ストレージアカウント",
  "Both machines need the Azure CLI and permission on that container.":
    "両方の機械に Azure CLI と、そのコンテナーへの権限が要ります。",
  "Somewhere else": "そのほかの置き場所",
  "The command that puts a file there": "そこへ置くコマンド",
  "The command that gets it back": "そこから取るコマンド",
  "Both run on whichever machine is sending or fetching, so both have to work on both. {f} is the file on that machine, {n} the name in the store.":
    "送る側でも取る側でも同じ2つを使うので、両方の機械で動く必要があります。{f} はその機械でのファイル、{n} は置き場所での名前です。",
  "Nothing of the store's is kept here — each machine uses the credentials it already has, and what is left in it is removed once the file is across. The seven steps of changing a file are the same either way: the real file is fetched, copied on both sides, and the difference goes on an approval card before anything is written.":
    "置き場所の資格情報は、ここには持ちません。それぞれの機械が、もともと持っているもので入ります。運び終えたものは消します。ファイル変更の7段はどちらでも同じで、実物を取り、両側に控えを作り、差分を承認カードに出してから書き戻します。",

  // localeController.ts
  "That is not a language this can use.": "その言語は扱えません。",

  // window.ts
  "{label} — {host}": "{label} — {host}",

  // rdpSession.ts
  "This build has no screen (RDP) viewer in it. Sessions over SSH, files and the agent all still work.":
    "このアプリには画面（RDP）の表示部分が入っていません。SSHのセッション・ファイル・Agentはこのまま使えます。",
  "The RDP helper has not been built. Run native/rdp/build.sh (FreeRDP 3 is required).":
    "RDPヘルパーがまだビルドされていません。native/rdp/build.sh を実行してください（FreeRDP 3 が要ります）。",
  "This server's certificate is not the one recorded. Either {where} was rebuilt, or it is a different server. If you rebuilt it, forget this server's key in the settings and then connect.":
    "このサーバの証明書が前回と違います。{where} は作り直されたか、別のサーバです。作り直したのなら、設定でこのサーバの鍵を忘れさせてから接続してください。",
  "The helper exited ({code})": "ヘルパーが終了しました ({code})",
  "The clipboard contents are too large.": "クリップボードの内容が大きすぎます。",
  "The screen stream lost its place.": "画面の受信が同期を失いました。",

  // controller.ts
  "The recording cannot be read.": "録画の中身が読めません。",
  "There is no such recording.": "その録画はありません。",
  "Write out the recording": "録画の書き出し",
  "screen-recording_{host}_{stamp}": "画面録画_{host}_{stamp}",
  "WebM (video)": "WebM（動画）",

  // store.ts
  "That recording is no longer open.": "その録画はもう開いていません。",
  "Stopped: it grew too large.": "大きくなりすぎたので止めました。",
  "The recording grew too large and was stopped.": "録画が大きくなりすぎたので止めました。",
  "That name points outside the recording.": "その名前は録画の外を指しています。",

  // sshSession.ts
  "A shell could not be opened: {reason}": "シェルを開けません：{reason}",
  "reason unknown": "理由不明",
  "tmux is not available; opening an ordinary shell.": "tmux がないため通常のシェルで開きます。",
  "The other end could not be verified: its key differs from the one recorded, or you answered that you do not trust it.":
    "接続先の確認に失敗しました。鍵が前回と違うか、信頼しないと答えたためです。",
  "The key file cannot be read. Check its format, or the passphrase.":
    "鍵ファイルを読めません。形式かパスフレーズを確認してください。",
  "The key needs a passphrase.": "鍵にパスフレーズが必要です。",
  "Signing in failed. Check the user name, and the password or the key.":
    "認証に失敗しました。ユーザー名と、パスワードまたは鍵を確認してください。",
  "The connection was refused. Check that SSH is running.": "接続を拒否されました。SSHが動いているか確認してください。",
  "No answer. Check the address and the port.": "応答がありません。アドレスとポートを確認してください。",
  "The host name cannot be resolved.": "ホスト名を解決できません。",

  // controller.ts
  "This server's state cannot be read — it appears to be neither Linux nor Windows.":
    "このサーバの状態を読めません。LinuxでもWindowsでもないようです。",

  // bridge.ts
  "The key at the other end differs. Expected {expected} / found {found}":
    "接続先の鍵が違います。期待 {expected} / 実際 {found}",
  "Nothing to connect to was handed over.": "接続先が渡されていません。",
  "Connecting to {where}…": "{where} へ接続しています…",
  "— The connection has ended. You can close this window.": "— 接続が終了しました。この窓は閉じて構いません。",

  // rfb.ts
  "The screen data is too large.": "画面のデータが大きすぎます。",
  "The connection was refused.": "接続を拒否されました。",
  "This server asked for a way of signing in that is not supported.": "このサーバは対応していない認証方式を要求しました。",
  "This server's sign-in parameters are not valid.": "このサーバの認証パラメータが正しくありません。",
  "Could not answer this server's sign-in (Apple).": "このサーバの認証（Apple）に応答できませんでした。",
  "Could not answer this server's sign-in (UltraVNC).": "このサーバの認証（UltraVNC）に応答できませんでした。",
  "This server's VeNCrypt ({version}) is not supported.": "このサーバのVeNCrypt（{version}）には対応していません。",
  "This server would not accept VeNCrypt 0.2.": "このサーバはVeNCrypt 0.2 を受け付けませんでした。",
  "This server offered no way of signing in that can be used.": "このサーバは使える認証方式を返しませんでした。",
  "This server refused to connect over TLS.": "このサーバがTLSでの接続を拒否しました。",
  "Either the password is wrong, or the sign-in was refused.": "パスワードが違うか、認証を拒否されました。",
  "Part of the screen points outside the screen.": "画面の一部が、画面の外を指しています。",
  "The screen could not be decompressed.": "画面の展開に失敗しました。",
  "Unsupported encoding ({encoding}).": "未対応のエンコーディングです（{encoding}）。",
  "The screen size is not valid ({width}×{height}).": "画面の大きさが正しくありません（{width}×{height}）。",

  // security.ts
  "This server's VNC asks to connect over anonymous TLS, which is TigerVNC's default. That way is not supported. Either set up an X509 certificate on the server, or go through a jump server and allow sending in the clear in the settings.":
    "このサーバのVNCは匿名TLSでの接続を求めています（TigerVNCの既定）。この方式には対応していません。サーバ側でX509証明書を設定するか、踏み台経由にしたうえで、設定で「平文でも送る」を許可してください。",
  "This server wants a user name and a password. Fill them in under the connection settings.":
    "このサーバはユーザー名とパスワードを求めています。接続設定で入れてください。",
  "This server asked for a way of signing in that is not supported ({types}).":
    "このサーバは対応していない認証方式を要求しました（{types}）。",
  "This server accepts only Plain, which sends the password in the clear. If you are inside a jump server or a VPN, tick \"Allow the password to be sent in the clear\" in the connection settings.":
    "このサーバはパスワードを平文で送る方式（Plain）しか受け付けません。踏み台やVPNの内側で使うのであれば、接続設定の「パスワードを平文で送ることを許す」を入れてください。",
  "This server wants a user name. Fill it in under the connection settings.":
    "このサーバはユーザー名を求めています。接続設定で入れてください。",

  // zrle.ts
  "The ZRLE data is incomplete.": "ZRLEのデータが足りません。",
  "Unsupported ZRLE tile ({tile}).": "ZRLEの未対応のタイル（{tile}）です。",

  // vncSession.ts
  "Could not reach {where} (timed out).": "{where} に接続できませんでした（時間切れ）。",
  "The connection to {where} went away.": "{where} との接続が切れました。",
  "{where} presented no certificate.": "{where} が証明書を示しませんでした。",
  "Encryption (TLS) with {where} failed: {reason}": "{where} との暗号化（TLS）に失敗しました：{reason}",
  "{where} refused the connection. Check that VNC is running and that the port is right.":
    "{where} が接続を拒否しました。VNCが動いているか、ポートが合っているか確かめてください。",
  "{where} cannot be reached. Check the route and the firewall.":
    "{where} に届きません。経路やファイアウォールを確かめてください。",
  "No server by the name {where} could be found.": "{where} という名前のサーバが見つかりません。",
  "{where} cut the connection.": "{where} との接続が切られました。",
  "Connecting to {where} failed.": "{where} との接続に失敗しました。",

  // secretStore.ts
  "Credentials cannot be encrypted on this machine. Rather than write a password out in the clear, nothing was saved.":
    "この環境では認証情報を暗号化して保存できません。パスワードを平文で書き出さないため、保存を中止しました。",
  "The saved credentials cannot be read. They may have been encrypted by another user, or on another machine.":
    "保存済みの認証情報を読み取れません。別のユーザーや別のマシンで暗号化された可能性があります。",
  "The saved credentials are not in a shape this can read.": "保存済みの認証情報の形式が正しくありません。",

  // screenCapture.ts
  "This screen cannot be recorded.": "この画面は録画できません。",

  // ErrorBoundary.tsx
  "This screen could not be drawn": "画面を表示できませんでした",
  "Nothing was sent to the machine you are working on. Reload, or look at the developer console for the cause.":
    "対象PCへの操作は送られていません。読み込み直すか、開発者ツールのコンソールで原因を確認してください。",
  "Reload": "再読み込み",

  // AgentSettingsForm.tsx
  "A browser has opened. Give permission there.": "ブラウザを開きました。そちらで許可してください。",
  "A browser has opened. Type this code into it.": "ブラウザを開きました。そちらの画面に、このコードを入力してください。",
  "Who the agent asks. It is the same for every server, and each run can pick one from the conversation's menu. What gets sent is the goal you wrote, the commands the agent ran and what came back. Where a customer's output ends up differs by model, so check before choosing.":
    "Agentが何に訊くかです。すべてのサーバに共通で、実行ごとにどれを使うかは会話のメニューから選べます。ここに送られるのは、あなたが書いた目標と、Agentが実行したコマンドとその出力です。顧客のサーバの出力がどこへ出るかはモデルごとに違うので、選ぶ前に確かめてください。",
  "Registered": "登録済み",
  "+ Add a model": "＋ モデルを追加",
  "None yet. Until one is added, the agent cannot run.": "まだ1つもありません。1つ追加するまで、Agentは実行できません。",
  "Make it the default": "既定にする",
  "(no name)": "（名前なし）",
  "Delete": "削除",
  "Model settings": "モデルの設定",
  "New model": "新しいモデル",
  "Close": "閉じる",
  "What to call it (it appears in the conversation's menu)": "呼び名（会話のメニューに出ます）",
  "Our GPU box / the GPT subscription": "社内のGPU機 / 契約のGPT",
  "How will you use it?": "どうやって使いますか。",
  "Through a subscription": "契約プランで使う",
  "ChatGPT, Claude and the like, paid monthly. You sign in":
    "ChatGPT・Claude など、月額で契約しているもの。ログインします",
  "With an API key": "APIキーで使う",
  "Gemini, OpenAI, our own GPU box. You fill in a URL and a key":
    "Gemini・OpenAI・社内のGPU機。URLとキーを入れます",
  "Service": "サービス",
  "Sign out": "ログアウト",
  "Starting the sign-in…": "ログインを始めています…",
  "Signed in.": "ログインできました。",
  "Could not sign in. Try again — if the browser page is still open, close it first.":
    "ログインできませんでした。もう一度お試しください。ブラウザの画面が残っていれば閉じてから押してください。",
  "Sign in": "ログイン",
  "Signing in…": "ログイン中…",
  "Model ID (empty means {model})": "モデルID（空欄なら {model}）",
  "Model ID (the name that service calls it)": "モデルID（そのサービスが名乗る名前）",
  "The URL to reach (ending in /v1)": "接続先のURL（末尾は /v1）",
  "API key (encrypted and kept on this machine)": "APIキー（このPCで暗号化して保存します）",
  "Saved. Type only to change it": "保存済み。変えるときだけ入力",
  "Forget the saved key": "保存済みのキーを消す",
  "It can read images (an agent that works the screen needs this)": "画像を読める（画面を操作するAgentは、これが要ります）",
  "Cancel": "やめる",
  "Save": "保存する",
  "Add": "追加する",
  "Saving…": "保存中…",
  "Run here": "こちら側の実行",
  "The agent can do its analysis and write files in an isolated workspace inside this machine. What that workspace allows is chosen here.":
    "Agentは、解析やファイル生成をこのPCの中の隔離された作業場で行えます。その作業場の決まりをここで選びます。",
  "Isolation": "隔離",
  "The agent can do its analysis and write files in an isolated workspace inside this machine. It has no network there, cannot write outside the workspace, and cannot read your home. What reaches the server is still one allowed command at a time.":
    "Agentは、解析やファイル生成をこのPCの中の隔離された作業場で行えます。そこにはネットワークが無く、作業場の外には書けず、あなたのホームは読めません。サーバへ届くのは、これまでどおり許可されたコマンド1行だけです。",
  "How to isolate": "隔離のしかた",
  "Match this machine (recommended)": "このPCに合わせる（推奨）",
  "macOS isolation (sandbox-exec)": "macOSの隔離（sandbox-exec）",
  "Linux isolation (bubblewrap)": "Linuxの隔離（bubblewrap）",
  "If the isolation you chose cannot be built on this machine, running here is switched off altogether. It is not a limit that a setting can loosen. Choosing Docker requires the image to be here already — nothing is fetched at run time.":
    "選んだ隔離をこのPCで用意できないときは、こちら側の実行そのものが無効になります。設定で緩められる制限ではありません。Dockerを選ぶときは、使うイメージが手元にある必要があります（実行のたびに取りに行くことはしません）。",
  "Isolation on this machine: {wall}": "このPCの隔離：{wall}",
  "This machine has no way to isolate.": "このPCには隔離の仕組みがありません。",
  "Turn this on and the commands the agent writes run": "有効にすると、Agentが書いたコマンドが",
  "on this machine, with your own privileges": "あなたの権限で、このPCの上で",
  ". Your customers' saved credentials and the models' API keys are within reach of those privileges. To get isolation back, install WSL2 or Docker.":
    "実行されます。保存された顧客の資格情報やモデルのAPIキーも、その権限の範囲にあります。隔離を戻すには WSL2 または Docker を入れてください。",
  "Even switched on, running here still needs": "有効にした場合も、こちら側の実行は",
  "approval line by line": "1行ごとに承認",
  "(the automatic setting does not change this). The record keeps the fact that it ran without isolation.":
    "が要ります（自動実行の設定でも変わりません）。実行記録には、隔離が無いまま実行したことが残ります。",
  "Take responsibility and allow running without isolation": "責任を自分で引き受け、隔離なしでの実行を有効にする",
  " on this machine (": " に、このPC（",
  ").": "）で有効にしました。",
  "default": "既定",
  "Nowhere to connect": "接続先なし",
  "No model named": "モデル名なし",
  " · no key set": "・キー未設定",
  "Paste the API key.": "APIキーを貼りつけてください。",
  "Which one shall it be?": "どれで進めますか。",
  "Paste the code the browser shows after you allow it (or the URL it sends you back to).":
    "ブラウザで許可したあとに出るコード（または戻り先のURL）を、ここに貼りつけてください。",
  "Sign in to {service}": "{service}にログイン",
  "If it will not work, paste the code": "うまくいかないときは、コードを貼る",

  // CatalogSection.tsx
  "Automatic": "自動",
  "Runs without asking (destructive ones and sudo are always asked)": "確認なしで実行します（壊すものとsudoは常に確認）",
  "Partly automatic": "一部自動",
  "Runs without asking only in the forms that read": "読み取りになる書き方だけ確認なしで実行します",
  "Ask": "確認",
  "Asks a person before every run": "毎回、実行前に人に聞きます",
  "Refused": "禁止",
  "Refused without asking, and the reason goes back into the conversation": "聞かずに断ります。理由が会話に返ります",
  "A command the catalogue does not have": "カタログに無いコマンド",
  "Command knowledge": "コマンドの知識",
  "This application knows {linux} commands on Linux and {windows} on Windows. The ones that read run on their own, the ones that change a server are asked about, and the ones that destroy always go to a person. To treat a command differently, press its button in the list.":
    "このアプリは Linux {linux}個・Windows {windows}個のコマンドを把握しています。読み取りは自動で動き、サーバを変えるものは確認し、壊すものは必ず人に聞きます。違う扱いにしたいコマンドは、一覧でそのままボタンを押してください。",
  "Loading…": "読み込み中…",
  "Rules for everything": "全体の決まり",
  "Run commands that only read without asking": "読み取りのコマンドは確認なしで実行する",
  "Allow sudo (approved each time it is used)": "sudo を許す（使うたびに承認が要ります）",
  "List": "一覧",
  "Search the name or the description (e.g. systemctl, log)": "名前か説明で探す（例：systemctl、ログ）",
  "All": "すべて",
  "Show only what you treat differently from the catalogue": "カタログと違う扱いにしたものだけを見る",
  "Decided by you {count}": "自分で決めた {count}",
  "{note} (automatic: {verbs})": "{note}（自動：{verbs}）",
  "Decided by you": "自分で決めた",
  "{count} more. Narrow the search.": "ほか {count} 個。絞り込んでください。",
  "You have not overridden anything. The catalogue's judgement stands.":
    "自分で決めたものはありません。カタログの判断のまま動きます。",
  "Nothing found. A command nobody knows can still be run — it stops first and you decide.":
    "見つかりません。知らないコマンドも実行はできます — 実行前に止まって、あなたが決めます。",
  "What is remembered per server": "サーバごとの記憶",
  "Clear": "消す",
  "What you chose under \"from now on\" on an approval card during a run. It applies to that server only. Entries cannot be edited one by one — clear them and decide again on the next run.":
    "実行中の承認カードで「今後は…」を選んだ分です。そのサーバだけに効きます。1件ずつは直せません — 消して、次の実行でもう一度決めてください。",

  // FilesPane.tsx
  "No SSH is set up for this server, so files cannot be handled.": "このサーバにSSHの設定がないため、ファイルを扱えません。",
  "↑ Up": "↑ 上へ",
  "+ Send": "＋ 送る",
  "↓ Fetch ({count})": "↓ 受け取る（{count}）",
  "↓ Fetch": "↓ 受け取る",
  "This directory is empty.": "空のディレクトリです。",
  "Abort": "中止",
  "Open": "開く",

  // FleetPane.tsx
  "Step by step": "都度承認",
  "Automatic (destructive and sudo still asked)": "自動（破壊的とsudoは承認）",
  "Plan only (runs nothing)": "計画のみ（実行しない）",
  "Run across servers": "一斉実行",
  "Hands the same goal to every server you picked. Each run is on its own — one failure does not touch the others. Each server's record still applies.":
    "選んだサーバに、同じ目標を一度に渡します。サーバごとに独立した実行です — 1台の失敗は他に影響しません。各サーバの台帳はそのまま効きます。",
  "Servers ({count})": "サーバ（{count} 台）",
  "No server here has anywhere to connect to.": "接続先のあるサーバがありません。",
  "Goal": "目標",
  "e.g. Restart nginx and check whether the 502s stopped": "例：nginx を再起動して、502 が消えたか確かめて",
  "How to approve": "承認のしかた",
  "Start on {count}": "{count} 台で開始する",
  "Open this server's conversation": "このサーバの会話を開く",
  "Set up another run": "別の一斉実行を組む",
  "Waiting": "待機",
  "Waiting for approval": "承認待ち",
  "Command {n}, running…": "{n}件目　実行中…",
  "Running…": "実行中…",
  "Done": "完了",
  "It has a question": "質問あり",

  // GlobalSettings.tsx
  "Sub-agents": "サブエージェント",
  "Skills": "スキル",
  "Prompts": "プロンプト",
  "Instructions": "指示",
  "Extensions": "拡張",
  "Packages": "パッケージ",
  "Server keys": "サーバの鍵",
  "Language": "言語",

  // HostForm.tsx
  "Turn on a screen (RDP or VNC) or SSH.": "画面（RDP / VNC）か SSH のどれかを有効にしてください。",
  "Enter the RDP host.": "RDP のホストを入力してください。",
  "Enter the VNC host.": "VNC のホストを入力してください。",
  "Enter the SSH host.": "SSH のホストを入力してください。",
  "Choose where the private key is.": "秘密鍵の場所を選んでください。",
  "This server's settings": "このサーバの設定",
  "Connection": "接続",
  "Address and account": "アドレスとアカウント",
  "Sign-in": "認証",
  "Password or private key": "パスワードか秘密鍵",
  "Route": "経由",
  "Jump server": "踏み台",
  "tmux and keeping it open": "tmux と保持",
  "Name": "名前",
  "Customer A, main server": "お客様A 基幹サーバ",
  "RDP (screen)": "RDP（画面）",
  "Host": "ホスト",
  "Port": "ポート",
  "User": "ユーザー",
  "Password": "パスワード",
  "RDP password": "RDPのパスワード",
  "VNC (screen)": "VNC（画面）",
  "User (only if needed)": "ユーザー（要るときだけ）",
  "Usually left empty": "空でよいことが多い",
  "VNC password": "VNCのパスワード",
  "Ordinary VNC takes a password and no user name. Fill this in only for the servers that use one — TigerVNC, macOS screen sharing, UltraVNC.":
    "ふつうのVNCはパスワードだけで、ユーザーは要りません。TigerVNC・macOSの画面共有・UltraVNC など、ユーザーを使う方式のサーバのときだけ入れてください。",
  "Allow the password to be sent in the clear": "パスワードを平文で送ることを許す",
  "Only needed for VNC servers that cannot encrypt. With this on, this server's password crosses the network as it is. Allow it only inside a jump server or a VPN.":
    "暗号化できないVNCサーバにだけ必要です。入れると、このサーバのパスワードがそのままの形でネットワークを流れます。踏み台やVPNの内側でだけ許してください。",
  "SSH (session)": "SSH（セッション）",
  "Open inside tmux on the server (what is running there survives a dropped line)":
    "サーバ側の tmux で開く（回線が切れても、向こうの実行は続く）",
  "Keep it on this machine (the session survives Forge closing)": "この作業PCで保持する（Forgeが落ちてもセッションが残る）",
  "Unavailable: this machine has no tmux": "この作業PCに tmux がないため使えません",
  "Private key": "秘密鍵",
  "SSH password": "SSHのパスワード",
  "Choose a key": "鍵を選ぶ",
  "Passphrase (if the key has one)": "パスフレーズ（鍵に設定されている場合）",
  "Leave empty if there is none": "なければ空のまま",
  "Jump server (when this one cannot be reached directly)": "踏み台（このサーバへ直接つながらないとき）",
  "None (connect directly)": "使わない（直接つなぐ）",
  "No server here can act as a jump server yet.": "踏み台にできるサーバがまだありません。",
  "A jump server is registered like any other server": "踏み台も1台のサーバとして登録します",
  "Fill in SSH and add it, and it becomes selectable here.": "SSHの設定を入れて追加すると、ここで選べるようになります。",
  "Register a jump server": "踏み台を登録する",
  "Pick another server from the list. Its password, its key and its fingerprint are used exactly as registered.":
    "一覧にある別のサーバを選びます。そのサーバのパスワードや鍵、鍵の確認は、登録済みのものがそのまま使われます。",
  "Passwords and passphrases are encrypted into this machine's keystore and never come back to the screen. Save with the box empty and the stored one is kept. The private key itself is not copied — it is read from where you chose, each time you connect.":
    "パスワードとパスフレーズはこのPCのキーストアで暗号化して保存され、画面には戻りません。空のまま保存すれば、保存済みのものがそのまま使われます。秘密鍵そのものは複製せず、選んだ場所から接続のたびに読みます。",
  "Delete this server": "このサーバを削除する",

  // HostStatusPanel.tsx
  "Without SSH the state cannot be read.": "SSHの設定がないため、状態を読めません。",
  "Reading the state…": "状態を読んでいます…",
  "Measuring": "計測中",
  "Memory": "メモリ",
  "Disk {mount}": "ディスク {mount}",
  "Disk": "ディスク",
  "1 min / 5 min / 15 min": "1分 / 5分 / 15分",
  "Above the core count": "コア数超過",
  "Up {uptime}": "稼働 {uptime}",
  "Collapse": "折りたたむ",
  "Details": "詳しく",
  "Own window": "別窓",
  "Host name": "ホスト名",
  "Kernel": "カーネル",
  "As of {when}, read over SSH — nothing is installed on the server.":
    "{when} 時点。SSHで読んでいます — サーバには何も入れていません。",
  "{days}d {hours}h": "{days}日 {hours}時間",
  "{hours}h {minutes}m": "{hours}時間 {minutes}分",

  // InventoryPane.tsx
  "Scheduled jobs": "定期実行",
  "Containers": "コンテナ",
  "Logs": "ログ",
  "No SSH is set up for this server, so nothing can be read.": "このサーバにSSHの設定がないため、読めません。",
  "{count} updates": "更新 {count}",
  " ({count} of them security)": "（うちセキュリティ {count}）",
  "A restart is needed": "再起動が必要",
  "Not read yet.": "まだ読んでいません。",
  "Listening": "待ち受け",
  "Process": "プロセス",
  "Reachable from outside": "外から届く",
  "This machine only": "この機械の中だけ",
  "Process names are only visible to an account with the privilege.": "プロセス名は、権限のあるアカウントでないと見えません。",
  "Only what is running": "動いているものだけ",
  "Everything, stopped ones too ({count})": "停止中も含めて全部（{count}）",
  "No scheduled jobs are set.": "定期実行の設定はありません。",
  "Neither Docker nor Podman was found.": "Docker も Podman も見つかりませんでした。",
  "Image": "イメージ",
  "No firewall was found": "firewall は見つかりませんでした",
  "not in force": "効いていません",
  "There is no log that can be read": "読めるログがありません",
  "Only lines containing this text": "この文字を含む行だけ",
  "■ Stop": "■ 止める",
  "▶ Follow": "▶ 追う",
  "Waiting…": "待っています…",
  "Press Follow to show it. It starts with the last 300 lines and then keeps up with whatever arrives.":
    "「追う」で表示します。直近300行から始めて、そのあとは流れてくるものを続けます。",

  // KartePane.tsx
  "Server logbook": "サーバー台帳",
  "What you see here is handed to the agent at the start of its next run.":
    "ここに見えているものが、次の実行の始めにAgentへ渡ります。",
  "Your notes": "操作者のメモ",
  "What the agent should know about this server (e.g. production DB is web-db; be careful about restarts)":
    "このサーバについて、Agentに知っておいてほしいこと（例：本番のDBは web-db、再起動は要注意）",
  "There are unsaved changes": "未保存の変更があります",
  "Saved": "保存済み",
  "Handover": "申し送り",
  "None yet. Every run that ends in done leaves its summary here.":
    "まだありません。実行が done で終わるたびに、その要約がここに残ります。",
  "Delete this handover": "この申し送りを消す",
  "The facts handed to the agent (summary)": "Agentに渡る事実（要約）",
  "as of {when}": "{when} 時点",
  "Read again": "読み直す",
  "With no SSH, the agent is handed the screen and nothing else.": "SSHが無いため、Agentには画面だけが渡ります。",
  "Could not read it just now: {reason}": "いま読めませんでした：{reason}",
  "(nothing could be read)": "（読み取れた情報がありません）",
  "Show all": "全部見る",
  "Collapse all": "全部たたむ",
  "What is remembered for this server": "このサーバの記憶",
  "None yet. Choosing \"from now on\" on an approval card during a run collects them here.":
    "まだありません。実行中の承認カードで「今後は…」を選ぶと、ここに貯まります。",
  "Clear everything remembered for this server": "このサーバの記憶をすべて消す",

  // KitsSection.tsx
  "How to look into the usual set-ups, installed in one go. Once in, the knowledge reaches the agent and the standard investigations are ready in the chat's + menu. Nothing to configure. Permissions and behaviour do not change — what may be run is still the setting for the whole installation.":
    "よくある構成の調べ方を、まとめて入れられます。入れるとその知識がAgentに効き、チャットの＋メニューから定型調査をすぐ始められます。細かい設定は要りません。権限や動き方は変わりません——何を実行してよいかは、これまでどおりインストール全体の設定です。",
  "installed": "入っています",
  "Remove": "外す",
  "Removing…": "外しています…",
  "Install": "入れる",
  "Installing…": "入れています…",
  "What it installs (knowledge)": "入れるもの（知識）",
  "What it can look into (one click from the chat)": "できる調査（チャットからワンクリック）",

  // KnownHostsSection.tsx
  "The fingerprint recorded the first time you connected. From then on this application refuses any server that presents a different key. Forget one here only when you have rebuilt that server.":
    "初めて接続したときに記録した指紋です。次からは、これと違う鍵を出すサーバには接続しません。サーバを作り直したときだけ、ここで忘れさせてください。",
  "Recorded keys": "記録した鍵",
  "Nothing recorded yet.": "まだ1台も記録していません。",
  "Forget": "忘れる",

  // LanguageSection.tsx
  "This changes the words on screen, how dates and numbers are written, and the messages this application shows you. The agent answers you in the language you choose here as well.":
    "画面の言葉、日付と数の書き方、こちらから出すお知らせの言葉が変わります。Agentが操作者に返す言葉も、選んだ言語になります。",
  "The language could not be changed.": "言語を変えられませんでした。",
  "Anything not yet translated appears in Japanese. The agent's own instructions — what it may run, what it has to ask a person about — stay in Japanese in every language: four copies of the safety rules would mean one of them going stale.":
    "訳が入っていないところは、日本語のまま出ます。Agent自身への指示（何を実行してよいか、何を人に聞くか）は、どの言語でも日本語のままです——安全の決まりを4つに分けて持つと、そのうち1つだけが古くなるからです。",
  "The language this application was written in.": "このアプリが書かれた言葉です。",
  "Shows everything in English.": "英語で表示します。",
  "Simplified characters, as used in mainland China.": "中国大陸で使われる簡体字で表示します。",
  "Traditional characters, as used in Taiwan and Hong Kong.": "台湾・香港で使われる繁体字で表示します。",

  // ProfilesSection.tsx
  "Unnamed agent": "名前のないAgent",
  "A model, an instruction and a way of approving, kept together under a name. You can pick one in a conversation, or hand work to it from another sub-agent. What it may run is not decided here — every one of them follows the rules under Command knowledge.":
    "モデル・指示・承認のしかたを、ひとまとまりにして名前を付けたものです。会話で選んだり、別のサブエージェントから仕事を任せたりできます。コマンドの権限はここでは決まりません — 全員が「コマンドの知識」の決まりで動きます。",
  "+ Add an agent": "＋ エージェントを追加",
  "None yet. If there is work you do often, you can name the combination and keep it here.":
    "まだありません。よくやる仕事があれば、その組み合わせに名前を付けておけます。",
  "Sub-agent settings": "エージェントの設定",
  "New agent": "新しいエージェント",
  "Read the logs only / fix production": "ログを読むだけ / 本番を直す",
  "Run commands (SSH)": "コマンドを実行する（SSH）",
  "Work the screen (RDP)": "画面を操作する（RDP）",
  "It works the screen with a mouse and a keyboard. This agent": "マウスとキーボードで画面を操作します。このAgentは",
  "cannot run any command at all": "コマンドを一切実行できません",
  "— if it could open a shell on the screen and type, the rules about commands would mean nothing. Servers without SSH are looked after this way. For anything that stops a service, use Approve each one and watch it action by action.":
    "— 画面からシェルを開いて打てるなら、コマンドの決まりは意味を持たなくなるからです。SSHの無いサーバはこちらで見ます。止めるものは「都度承認」で1操作ずつ見てください。",
  "The default model": "既定のモデル",
  "Who it may hand work to (optional)": "任せられる相手（任意）",
  "Whoever is handed the work uses its own model and its own command rules. It cannot hand the work on again.":
    "任せた相手は自分のモデルと自分のコマンドの決まりで動きます。相手はさらに別の相手へ任せられません。",
  "Instructions for this agent (optional)": "このAgentへの指示（任意）",
  "e.g. On production, always say why before stopping anything": "例：本番では、止める前に必ず理由を言う",
  "Works the screen": "画面を操作",
  "Runs commands": "コマンドを実行",

  // RemoteAgentChat.tsx
  "Stopped: too many commands (if it is not finished, ask again)":
    "コマンドが多すぎるので止めました（終わっていなければ、もう一度指示してください）",
  "Stopped at the time limit": "制限時間で止まりました",
  "Stopped on an error": "エラーで止まりました",
  "Waiting for your answer": "回答を待っています",
  "Approve one command at a time": "1コマンドずつ承認する",
  "Auto": "自動で実行",
  "sudo and destructive ones are always approved": "sudoと破壊的なものは必ず承認",
  "Plan only": "計画のみ",
  "Runs nothing, writes only the steps": "何も実行せず手順だけ書く",
  "Reads run on their own": "読み取り自動",
  "Reads are asked about too": "読み取りも確認",
  "{count} exception|{count} exceptions": "例外 {count}",
  "{count} remembered here": "このサーバの記憶 {count}",
  "sudo allowed": "sudo可",
  "Commands that change the server, and any first-time command, stop before running":
    "サーバを変えるコマンドと初めてのコマンドは、実行前に止まります",
  "No screen (RDP or VNC) is set up for this server.": "このサーバに画面（RDP / VNC）の設定がありません。",
  "Nothing to connect to is set.": "接続先が未設定です。",
  "Open the connection settings": "接続設定を開く",
  "Not one model is registered.": "モデルが1つも登録されていません。",
  "\"{name}\" is not fully set up.": "「{name}」の設定が足りません。",
  "Chat": "チャット",
  "Runs": "実行の記録",
  "What was run on this server (opens in its own window)": "このサーバで何を実行したか（別の窓で開きます）",
  "Model and allowlist settings": "モデルと許可リストの設定",
  "New chat": "新しいチャット",
  "This machine has no way to isolate. A command the agent runs here runs with your own privileges, as it is. Every line needs approval.":
    "このPCには隔離の仕組みがありません。AgentがこのPCで動かすコマンドは、あなたの権限でそのまま実行されます。1行ごとに承認が要ります。",
  "(no goal)": "（目標なし）",
  "Show all ({count})": "すべて表示（合計{count}件）",
  "You do not need a server yet. Talking through how to look into something, drafting a skill, adding things up here — all of that works.":
    "サーバはまだ要りません。調べ方の相談、スキルの下書き、手元での集計はここでできます。",
  "Write in the box below what you want looked into on this server. Pasting the text of a monitoring alert is fine too.":
    "下の欄に、このサーバで何を調べてほしいかを書いてください。監視のアラート文面を貼り付けても構いません。",
  "This one had already been decided.": "この操作は、すでに決まっていました。",
  "Command {n}, thinking…": "{n}件目のコマンド　考えています…",
  "Thinking…": "考えています…",
  "Show the commands it ran": "実行したコマンドを見る",
  "{title}'s screen": "{title}の画面",
  "Take {title}'s screen away": "{title}の画面を外す",
  "The screen as it will be sent": "送るときの画面を渡します",
  "Send an instruction (e.g. leave that service alone)": "指示を送る（例：そのサービスは触らないで）",
  "Answer the agent's question": "Agentの質問に答える",
  "Write what you want done (e.g. put together the steps for surveying an Ubuntu box)":
    "頼みたいことを書く（例：Ubuntuの構成を調べる手順をまとめて）",
  "Write what to look into (e.g. find out why the disk is filling up)":
    "何を調べてほしいか書く（例：ディスクが逼迫している原因を調べて）",
  "What to add to this conversation": "この会話に足すもの",
  "Agent": "エージェント",
  "None (choose below instead)": "選ばない（下で個別に）",
  "Stop": "停止する",
  "Start": "開始する",
  "Just this once": "今回だけ",
  "Automatic from now on": "今後は自動",
  "Refused from now on": "今後は禁止",
  "Asked for by {by}": "{by} からの要求",
  "The screen the agent is looking at": "Agentが見ている画面",
  "Looking up what it does…": "説明を調べています…",
  "Looking up its history on this server…": "このサーバでの履歴を調べています…",
  "A first for this server": "このサーバでは初めてのコマンドです",
  "Run {count} time here before|Run {count} times here before": "このサーバで過去 {count}回 実行",
  "(last on {when})": "（最後は {when}）",
  "⚠ {note} (a machine read this; it can be wrong)": "⚠ {note}（機械の目です。読み違えることがあります）",
  "Commands of this kind are always asked about — it cannot be made automatic":
    "このコマンドは種類として毎回確認します（自動にはできません）",
  "Remember this decision": "この判断を記憶する",
  "Make only \"{program} {verb}\" automatic": "「{program} {verb}」だけを自動にする",
  "This particular form cannot be singled out": "この書き方だけの指定はできません",
  "While every command is approved, a remembered decision still stops each time. It takes effect in automatic mode":
    "都度承認のあいだは記憶しても毎回止まります。自動モードに切り替えると効きます",
  "Run it": "実行する",
  "Refuse it": "却下する",
  "You can write why in the box below": "却下の理由は下の欄に書けます",
  "{count} item|{count} items": "{count}件",
  "Show the {count} before this": "前の {count} 件を見る",
  "Close the full text": "全文を閉じる",
  "Show everything it will write": "書き込む全文を見る",
  "Question": "質問",
  "{bytes} bytes": "{bytes}バイト",
  "Saved to {where}": "{where} に保存しました",
  "Show the remaining {count} lines": "残り {count} 行を見る",
  "Before": "操作前",
  "After": "操作後",
  "A setting was passed in, so the output was not kept.": "設定値を渡したため、出力は保存していません。",
  "Rejected": "却下",
  "Failed": "失敗",
  "exit {code}": "終了 {code}",
  "Approved": "承認",
  "Do not think": "考えない",
  "fast, cheap": "速い・安い",
  "Think a little": "軽く考える",
  "Normal": "ふつう",
  "Think well": "よく考える",
  "slow, dear": "遅い・高い",
  "Think it right through": "とことん考える",
  "slowest of all": "いちばん遅い",
  "No model set": "モデル未設定",
  "just now": "たった今",
  "{minutes} min ago": "{minutes}分前",
  "{hours} h ago": "{hours}時間前",
  "{days} days ago": "{days}日前",
  "{weeks} weeks ago": "{weeks}週間前",
  "{months} months ago": "{months}か月前",

  // RemoteWorkspace.tsx
  "State": "状態",
  "CPU, memory, disk": "CPU・メモリ・ディスク",
  "Inventory": "構成",
  "Ports, services, cron, Docker, logs": "ポート・サービス・cron・Docker・ログ",
  "Logbook": "台帳",
  "Notes, handovers, the facts the agent gets": "メモ・申し送り・Agentに渡る事実",
  "Files": "ファイル",
  "To and from the server": "サーバとのやり取り",
  "Records": "記録",
  "The commands run on this server, and what came back": "このサーバで実行したコマンドと、その出力",
  "The key at {where} is not the one recorded. Unless you rebuilt it, do not connect. Recorded {expected} / now {found}":
    "{where} の鍵が前回と違います。作り直したのでなければ、つないではいけません。前回 {expected} / 今回 {found}",
  "Disconnected": "切断されました",
  "This screen is not up yet. Connect first, then record.": "この画面はまだ出ていません。接続してから録画してください。",
  "Stopped, because the connection went away.": "切断されたので止めました。",
  "Checking the server's key": "サーバの鍵の確認",
  "Connecting to {where} for the first time": "{where} に初めて接続します",
  "This server's key is not known yet. Now is the only moment you can tell whether the other end really is this server.":
    "このサーバの鍵をまだ知りません。相手が本当にこのサーバかを確かめられるのは、いまだけです。",
  "Trust it and connect": "信頼して接続する",
  "Close the menu": "メニューを閉じる",
  "Add a server": "サーバを追加",
  "Open the menu": "メニューを開く",
  "Remote maintenance": "リモート保守",
  "Show": "表示",
  "Show or hide the agent's column": "Agentの列を出し入れする",
  "{note} (opens in its own window)": "{note}（別の窓で開きます）",
  "Agent settings": "Agentの設定",
  "Agent settings (model, commands, skills)": "Agentの設定（モデル・コマンド・スキル）",
  "Run across servers (the same goal on several)": "一斉実行（複数サーバに同じ目標）",
  "Leave full screen": "全画面をやめる",
  "Full screen": "全画面",
  "Record": "録画する",
  "Recording {clock}": "録画中 {clock}",
  "Disconnect": "切断する",
  "Connect": "接続する",
  "Which screen to connect with": "どちらの画面でつなぐか",
  "Connect with {label}": "{label} でつなぐ",
  "Not connected": "未接続",
  "Press Connect and the screen appears here.": "「接続する」を押すと、ここに画面が出ます。",
  "Connecting…": "接続しています…",
  "Signing in and building the screen takes the far end a few seconds, sometimes longer.":
    "ログインして画面を作るまで、向こう側で数秒から十数秒かかります。",
  "Hands the agent the session you are looking at (this is what gets sent)":
    "いま見えているセッションの画面を、Agentに渡します（送るときの内容）",
  "Handed to the chat": "チャットに渡し中",
  "Hand to the chat": "チャットに渡す",
  "+ Open a session": "＋ セッションを開く",
  "Close {title}": "{title}を閉じる",
  "No session is open.": "セッションは開いていません。",
  "A session for typing commands becomes available once SSH is filled in.":
    "コマンドを打つセッションは、SSHを入れると使えます。",
  "The screen is already set up and usable now. An agent that looks at the screen and works it will run too.":
    "画面は設定済みなので、そちらは今すぐ使えます。Agentも、画面を見て操作するほうなら動きます。",
  "Nothing to connect to has been set.": "接続先が設定されていません。",
  "Fill in a screen (RDP or VNC) or SSH under the connection settings.":
    "画面（RDP / VNC）か SSH のどれかを「接続設定」で入れてください。",
  "Width of the chat": "チャットの幅",
  "Server settings": "サーバの設定",
  "No servers yet.": "サーバがまだありません。",
  "Register the address of a screen (RDP or VNC) or of SSH, and the screen and the session appear — and the agent can work that server.":
    "画面（RDP / VNC）か SSH のアドレスを登録すると、画面とセッションが出て、Agentがそのサーバを操作できるようになります。",
  "Set up the agent first": "Agentの設定を先にする",
  "Screen + {shell}": "画面+{shell}",

  // ResourceSection.tsx
  "A written procedure for one kind of work. Only the name and the description are always in view; the agent reads the body only when the work is related. It exists so that something like \"how to look at a 502 on this server\" need not be written out every time.":
    "特定の作業のやり方を書いた手順書です。名前と説明だけが常に見えていて、Agentは関係のある作業のときだけ中身を読みます。「このサーバで502を見るときの手順」のようなものを、毎回書き直さずに済ませるためのものです。",
  "None yet. If there is a procedure you want the agent to know, write it here.":
    "まだありません。Agentに覚えさせたい手順があれば、ここに書きます。",
  "`skills/<name>/SKILL.md`. The description in the frontmatter is the sentence the agent reads when choosing.":
    "`skills/<名前>/SKILL.md`。frontmatter の description が、Agentが選ぶときに読む文です。",
  "An instruction you use often, under a name. Pick it from the + menu in a conversation and the text lands in the box.":
    "よく使う指示に名前を付けたものです。会話の＋メニューから選ぶと、ここに書いた文が入力欄に入ります。",
  "+ Add a prompt": "＋ プロンプトを追加",
  "None yet. If you type the same instruction every time, you can name it and keep it here.":
    "まだありません。毎回打っている指示があれば、名前を付けて置いておけます。",
  "`prompts/<name>.md`. Picked from the + menu, the body lands in the box — you can edit it before sending.":
    "`prompts/<名前>.md`。＋メニューから選ぶと、本文が入力欄に入ります（送る前に直せます）。",
  "Code that steps in at the turning points of a run. It can hook just before a command runs, at the start of a session, and so on. It can also give the agent new tools.":
    "実行の節目に割り込むコードです。コマンドが実行される直前、セッションの開始時などにフックできます。Agentに道具を足すこともできます。",
  "+ Add an extension": "＋ 拡張を追加",
  "None yet. Recording a run, stopping on a condition — that sort of thing is written here.":
    "まだありません。実行を記録する、条件で止める、といったことをここで書きます。",
  "`extensions/<name>.ts`. The events you can hook are listed in Pi's docs/extensions.md.":
    "`extensions/<名前>.ts`。使えるイベントは Pi の docs/extensions.md にあります。",
  "Name (letters, digits and - _ .)": "名前（英数字と - _ .）",
  "Create": "作る",
  "Creating…": "作成中…",
  "(no description)": "（説明なし）",
  "Let the agent call: {tools}": "Agentが呼べるようにする：{tools}",
  "Allow its tools ({tools})": "道具を許す（{tools}）",
  "Open its folder": "場所を開く",
  "Contents": "中身",
  "Before you install it": "入れる前に",
  "Commands it uses:": "使うコマンド：",
  "{names} are commands this application does not know, or of a kind it will not run. At run time they go to you, or are refused.":
    "{names} はこのアプリの知らないコマンドか、実行させない種類です。実行時は操作者の確認か拒否になります。",
  "line {line}": "{line}行目",
  "This is the result of reading the contents, not something that stops anything running.":
    "これは中身を読んだ結果で、実行を止める仕組みではありません。",
  "An extension is": "拡張は",
  "A skill is": "スキルは",
  "something its author can also hide things in. What protects you is the allowlist at run time, the approvals and the record.":
    "書き手が隠すこともできます。守っているのは実行時の許可リスト・承認・記録です。",
  "The model is reading it…": "モデルが読んでいます…",
  "Have the model read it too": "モデルにも読ませる",
  "Press this and the body of the file is sent to the model you configured.":
    "押すと、このファイルの本文が設定しているモデルに送られます。",
  "What the model made of it": "モデルが読んだところ",
  "The model says there is nothing worth flagging.": "モデルは、気になる点は無いと言っています。",
  "This is what {by} made of it. It can be wrong.": "{by} が読んだ結果です。読み違えることがあります。",
  "Anything the author hid does not show up here either.": "書き手が隠したものは、ここにも出ません。",
  "What you want kept to on every server and every run. Whatever is written here sits in front of the agent at all times. Keep it short, and only write what can be kept.":
    "どのサーバでも、どの実行でも守ってほしいことです。ここに書いたものは常にAgentの前に置かれます。短く、守れることだけを書いてください。",
  "Instructions that always apply": "常に効く指示",
  "yes": "あり",
  "none": "なし",
  "e.g.\n- Answer in English\n- Before changing anything, say in one line what will change\n- If a service has to be stopped, say why first":
    "例：\n- 日本語で答える\n- 変更の前に、何を変えるかを一言で言う\n- 止めるべきサービスがあれば、先に理由を言う",
  "Saved as `AGENTS.md`. Empty it and there are no instructions again.":
    "`AGENTS.md` として保存されます。空にすると、指示なしに戻ります。",
  "A way of handing out skills, prompts and extensions together. They come from npm or git. Whatever is listed here is prepared by Pi the next time the agent starts.":
    "スキル・プロンプト・拡張をまとめて配る仕組みです。npm か git から入れます。ここに書いたものは、次にAgentが起動するときPiが用意します。",
  "What is installed": "入れているもの",
  "+ Add a package": "＋ パッケージを追加",
  "Add a package": "パッケージを追加",
  "Where from": "入手先",
  "npm:@foo/bar / git:github.com/user/repo / https://… / an absolute path":
    "npm:@foo/bar / git:github.com/user/repo / https://… / 絶対パス",
  "A package runs with this machine's privileges. An extension is code, and a skill can tell the agent to do anything. Read what is in it before installing somebody else's.":
    "パッケージはこの作業PCの権限で動きます。拡張はコードで、スキルはAgentに何をさせることも書けます。人のものを入れる前に中身を読んでください。",
  "Adding…": "追加中…",
  "Nothing installed yet.": "まだ入れていません。",
  "Only part of it is loaded": "読み込む中身を絞ってあります",

  // RunsPane.tsx
  "Stopped: too many": "多すぎて停止",
  "Out of time": "時間切れ",
  "Still asking": "質問のまま",
  "yesterday": "きのう",
  "Command history": "コマンド履歴",
  "Screen recordings": "画面の録画",
  "Write a report": "報告書を作る",
  "No runs recorded yet.": "まだ実行の記録はありません。",
  "Choose one on the left.": "左から選んでください。",
  "Category unknown": "カテゴリ不明",
  "Not run": "実行せず",
  "Not one command was run.": "コマンドは1つも実行されていません。",
  "The record ends here.": "記録はここまでです。",
  "Work report": "作業報告",
  "Write a work report": "作業報告を作る",
  "From": "開始",
  "To": "終了",
  "Choose the dates and press Create, and you get a report you can hand to the customer.":
    "期間を選んで「作る」を押すと、顧客に渡せる報告書ができます。",
  "Writing it out…": "書き出しています…",
  "Only commands containing this text": "この文字を含むコマンドだけ",
  "Show every output": "出力を全部見る",
  "Collapse every output": "出力を全部たたむ",
  "Write out what is showing": "いま出ている内容を書き出す",
  "Write out this list ({count})": "この一覧を書き出す（{count}件）",
  "Excel, spreadsheets": "Excel・表計算",
  "To paste into a report": "報告書に貼る",
  "Hand over as it is": "そのまま渡す",
  "To read in another program": "他のプログラムで読む",
  "No command contains that text.": "その文字を含むコマンドはありません。",
  "None yet. What the agent ran and what you typed in a session both end up here.":
    "まだありません。Agentが実行したコマンドと、セッションで打ったコマンドがここに残ります。",
  "The output was not kept": "出力は残していません",
  "Show the output": "出力を見る",
  "Hide the output": "出力を隠す",
  "Copy": "コピー",
  "Show this run": "この実行を見る",
  "Put it in a session": "セッションに入れる",
  "Write out": "書き出す",
  "None yet. Recordings made with Record on the screen end up here.":
    "まだありません。画面の「録画する」で撮ると、ここに残ります。",
  "{width}×{height} · {fps} fps · {parts} parts · {size}":
    "{width}×{height}・{fps}コマ/秒・{parts}本・{size}",
  " · it ends part-way": "・途中で終わっています",
  "Play": "再生",
  "This recording cannot be played.": "この録画を再生できません。",
  "{at} of {total}": "{at} / {total}本目",
  "1 part": "1本",

  // SelectMenu.tsx
  "Filter": "絞り込む",
  "Nothing found": "見つかりません",

  // (handed over as data)
  "The reading stopped part way. What is shown here may not be all of it.":
    "読み取りが途中で切れました。ここに出ているものが全部とは限りません。",
  "The open ports could not be read.": "開いているポートを読めませんでした。",
  "No systemd services — this machine may not use systemd.":
    "systemd のサービスがありません（systemd以外かもしれません）。",
  "The firewall settings could not be read.": "firewall の設定を読めませんでした。",
  "It starts processes on this machine": "このPCでプロセスを起動します",
  "It reads and writes this machine's files": "このPCのファイルを読み書きします",
  "It goes out to the network": "ネットワークに出ます",
  "It goes out to the network (fetch)": "ネットワークに出ます（fetch）",
  "It reads this machine's details": "このPCの情報を読みます",
  "Declared": "宣言されています",
  "A command the catalogue does not have, or of a kind that is not run. At run time it goes to you, or is refused":
    "カタログに無いか、実行させない種類のコマンドです。実行時は操作者の確認か拒否になります",
  "It gives the agent this tool": "この道具をAgentに足します",
  "This may be somewhere it sends to": "外部への送信先かもしれません",
  "Written down as a reference": "参照先として書かれています",
  "Everything (journal)": "システム全体 (journal)",

  // kits/index.ts

  // kits/catalog.ts
  "Unfamiliar server": "知らないサーバ",
  "How to work out what a server runs and where it keeps it, without knowing the distribution, the layout, or whether anything was installed by hand.": "ディストリビューションも配置も、手で入れたものがあるかどうかも分からないサーバで、何が動いていてどこに置かれているかを突き止める方法。",
  "Finding a server's configuration without guessing paths: ask the socket, the binary, the service manager and the package manager, in that order, and search the filesystem last.": "推測でパスを決めずにサーバの構成を突き止める方法。待受→バイナリ→サービス管理→パッケージ管理の順に尋ね、ファイル探索は最後にする。",
  "Work out what this server runs": "このサーバで何が動いているか調べる",
  "Sockets, binaries, units and packages — no guessed paths": "待受・バイナリ・ユニット・パッケージから。パスは推測しない",
  "Work out what this server runs and where its configuration lives. Start from what is listening and what owns those sockets, ask each binary where its own configuration is, and check the service manager and the package manager. Do not assume a distribution layout. Tell me what you could not read and why.": "このサーバで何が動いていて、設定がどこにあるかを調べてください。まず何が待ち受けていて、その待受を誰が持っているかから始め、各バイナリに自分の設定の場所を尋ね、サービス管理とパッケージ管理も確かめてください。ディストリビューションの配置を前提にしないでください。読めなかったものは、理由と一緒に教えてください。",
  "Find the logs for what is running": "動いているサービスのログを探す",
  "Per-unit journals and the files the daemons have open": "ユニット別のjournalと、プロセスがいま開いているファイル",
  "Find the logs for the services running on this server. Prefer the per-unit journal over hunting for files, and check what the running processes actually have open. Tell me which ones you cannot read.": "このサーバで動いているサービスのログを探してください。ファイルを探し回るより、ユニット別の journal を優先し、動いているプロセスが実際に開いているものも確かめてください。読めないものがあれば教えてください。",
  "Find what was changed from the defaults": "既定から変えられたものを探す",
  "The files somebody edited are the interesting ones": "誰かが手を入れたファイルが、見るべきファイル",
  "Find which configuration files on this server differ from what their packages shipped, and show me the ones that look deliberate. Anything not owned by a package is worth naming too.": "このサーバで、パッケージが配ったものと中身が違う設定ファイルを探して、意図的に見えるものを見せてください。どのパッケージにも属さないものも挙げてください。",
  "LAMP (WordPress, Apache, MySQL)": "LAMP（WordPress・Apache・MySQL）",
  "When a website is down, slow, or throwing errors: how to work through Apache, MySQL and WordPress.": "Webサイトが落ちた・遅い・エラーが出るとき、Apache・MySQL・WordPress を一通り調べます。",
  "Investigating Apache, MySQL and WordPress: where the logs are, how to get at 4xx/5xx, and how to look at a slow page and its database.": "Apache＋MySQL＋WordPress（LAMP）の調べ方。ログの場所、4xx/5xxの当たりの付け方、遅いページとDBの見方。",
  "Look into the 5xx/4xx errors": "5xx/4xxのエラーを調べる",
  "From the access and error logs: when, which URL, and how many": "アクセスログとエラーログから、いつ・どのURLで・何件出ているかを掴む",
  "Look into the Apache, PHP-FPM and MySQL errors and get a first idea of what is behind the recent 5xx/4xx. Start from whether the services are alive and what the latest log lines say, and if you need counts, copy the large logs across and total them up here. Do not copy out settings or passwords.": "Apache と PHP-FPM、MySQL のエラーを調べて、最近増えている 5xx/4xx の原因の当たりを付けてください。まずサービスの生死と直近のログを見て、件数の傾向が要るなら大きいログは作業場に写して集計してください。設定値やパスワードは書き写さないでください。",
  "Find out why the site is slow": "サイトが重い原因を探す",
  "Narrow it down from load, processes and MySQL's state": "負荷・プロセス・MySQLの状態から遅さの出どころを絞る",
  "Find out why the site is answering slowly. Start with the load and which of Apache, PHP-FPM and MySQL is eating the machine, then get a first idea of which pages or queries are slow.": "サイトの応答が遅い原因を調べてください。まず負荷と、Apache・PHP-FPM・MySQL のどれが食っているかを見て、遅いページやクエリの当たりを付けてください。",
  "Check that nothing has fallen over": "サービスが落ちていないか点検する",
  "Apache, MySQL and PHP-FPM: alive, and any recent crash": "Apache・MySQL・PHP-FPM の生死と直近のクラッシュを確認",
  "Check whether Apache, MySQL (or MariaDB) and PHP-FPM are alive and whether any of them has crashed or restarted recently, and if something is wrong, get a first idea of why.": "Apache・MySQL（または MariaDB）・PHP-FPM の生死と、直近で落ちたり再起動したりしていないかを点検して、異常があれば原因の当たりを付けてください。",
  "Check the WordPress configuration": "WordPressの設定を確認する",
  "wp-config and plugin errors (secrets stay hidden)": "wp-config とプラグイン起因のエラーを確認（秘密は伏せる）",
  "Check how WordPress is configured. Look at the settings in wp-config (which database it talks to, debugging, caching) and at the PHP errors from plugins and themes in error.log. You may read passwords and authentication keys, but do not copy them out.": "WordPress の構成を確認してください。wp-config の設定（DB接続先・デバッグ・キャッシュ）と、error.log に出ているプラグインやテーマ起因の PHP エラーを見てください。パスワードや認証キーは読んでも書き写さないでください。",
  "Nginx (web server, reverse proxy)": "Nginx（Web・リバースプロキシ）",
  "Nginx returning 502/504, a setting that has no effect, an expired certificate — where to look.": "Nginx が 502/504 を返す、設定が効かない、証明書が切れた——そんなときの調べ方。",
  "Investigating Nginx: checking the configuration (nginx -t), looking upstream for a 502/504, the access and error logs, and certificate expiry.": "Nginx の調べ方。設定の確認（nginx -t）、502/504 の上流の見方、アクセス/エラーログ、証明書の期限。",
  "Look into the 502/504": "502/504を調べる",
  "Narrow it down from error.log and whether the upstream is alive": "上流（PHP-FPM・アプリ）が返っていないかを error.log と上流の生死から絞る",
  "Look into why Nginx is returning 502/504. Read the upstream lines in error.log and get a first idea of whether the PHP-FPM or application behind it is down or timing out.": "Nginx が 502/504 を返している原因を調べてください。error.log の upstream の行を見て、後ろの PHP-FPM やアプリが落ちていないか・タイムアウトしていないかの当たりを付けてください。",
  "Check the configuration": "設定を確認する",
  "nginx -t, and what is actually in effect": "nginx -t と、実際に効いている設定を確認する",
  "Check the Nginx configuration. Start with nginx -t for validity, then work out which server and location the Host and path in question actually match.": "Nginx の設定を確認してください。まず nginx -t で妥当性を見て、問題の Host とパスにどの server/location が当たっているかを確かめてください。",
  "Check when the certificate expires": "証明書の期限を確認する",
  "TLS expiry, the chain, and whether the name matches": "TLS証明書の期限・チェーン・ドメイン一致を見る",
  "Check when the TLS certificate this Nginx uses expires, and whether there is anything wrong with its chain or with the name it is issued for.": "この Nginx が使っている TLS 証明書の期限と、チェーンやドメイン一致に問題がないかを確認してください。",
  "Total up the access log": "アクセスログを集計する",
  "Counts by status and by URL, to see what stands out": "ステータス別・URL別の件数から異常を掴む",
  "From the Nginx access log, get the shape of the traffic by status and by URL, and find anything that stands out. Copy large logs across and total them up here.": "Nginx のアクセスログから、ステータス別・URL別の件数の傾向を掴んで、異常が出ていないか調べてください。大きいログは作業場に写して集計してください。",
  "Docker (containers, Compose)": "Docker（コンテナ・Compose）",
  "A container that dies, restarts in a loop, or eats the disk — where to look in a container setup.": "コンテナが落ちる・再起動を繰り返す・ディスクを食う——コンテナ環境の調べ方。",
  "Investigating Docker and Compose: whether containers are alive and restarting, following their logs, resources and disk, and reading a Compose setup.": "Docker/Compose の調べ方。コンテナの生死と再起動、ログの追い方、リソースとディスク、Compose の構成。",
  "Look into a container that keeps dying": "落ちるコンテナを調べる",
  "Exit code, restart count and logs — including OOM": "終了コード・再起動回数・ログから原因を絞る（OOMも見る）",
  "Look into the containers that are dying or restarting in a loop. Use docker ps -a and docker inspect for the exit code, RestartCount and OOMKilled, and get a first idea of the cause from the logs.": "落ちたり再起動を繰り返したりしているコンテナを調べてください。docker ps -a と docker inspect で終了コードや RestartCount・OOMKilled を見て、ログから原因の当たりを付けてください。",
  "List the state of the containers": "コンテナの状態を一覧する",
  "Which are alive, and what they are using": "全コンテナの生死とリソース消費をまとめる",
  "List which containers are running and which are stopped, and summarise the state of each and what it is using (CPU, memory).": "動いているコンテナと止まっているコンテナを一覧して、それぞれの状態とリソース消費（CPU・メモリ）をまとめてください。",
  "Find what is eating the disk": "ディスクを食っている原因を探す",
  "The breakdown across images, containers and volumes": "イメージ・コンテナ・ボリュームの容量内訳を出す",
  "Find out what is making Docker eat the disk. Break it down with docker system df -v and show me what is using the space. Do not delete anything.": "Docker がディスクを食っている原因を調べてください。docker system df -v で内訳を出して、何が容量を使っているかを示してください。消す操作はしないでください。",
  "Check the Compose setup": "Composeの構成を確認する",
  "Services, ports and dependencies from the compose file (secrets stay hidden)": "composeファイルからサービス・ポート・依存を読む（秘密は伏せる）",
  "Check the Docker Compose setup on this machine. Read the services, ports and dependencies from the compose file. Do not copy out environment values or passwords.": "この環境の Docker Compose の構成を確認してください。compose ファイルからサービス・ポート・依存関係を読んでください。環境変数やパスワードは書き写さないでください。",
  "PostgreSQL": "PostgreSQL",
  "Cannot connect, slow, or eating the disk — where to look in PostgreSQL.": "接続できない・遅い・ディスクを食う——PostgreSQL の調べ方。",
  "Investigating PostgreSQL: whether it is alive and reachable, slow queries and waits, connection counts, disk and logs.": "PostgreSQL の調べ方。生死と接続、遅いクエリと待ち、接続数、ディスクとログの見方。",
  "Find out why it will not connect": "接続できない原因を調べる",
  "The service, the port, pg_hba and the connection limit": "サービス・ポート・pg_hba・接続数上限から絞る",
  "Find out why PostgreSQL will not accept a connection. Look at whether the service is alive and on its port, at the authentication in pg_hba.conf, and at the connection limit. Ask me for the password.": "PostgreSQL に接続できない原因を調べてください。サービスの生死とポート、pg_hba.conf の認証、接続数の上限を見て当たりを付けてください。パスワードは操作者に確認してください。",
  "Look into slow queries and waits": "遅いクエリ・待ちを調べる",
  "The heavy and waiting queries in pg_stat_activity": "pg_stat_activity から重い/待っているクエリを掴む",
  "Find out why PostgreSQL is slow. Use pg_stat_activity for long-running queries, waits and locks, and narrow down where the slowness comes from.": "PostgreSQL が遅い原因を調べてください。pg_stat_activity から長く動いているクエリや待ち、ロックを見て、遅さの出どころを絞ってください。",
  "Check the connection count": "接続数を確認する",
  "Connections by state, and idle in transaction": "状態別の接続数と idle in transaction を見る",
  "Check PostgreSQL's connections by state and tell me whether anything is wrong — idle in transaction piling up, for instance.": "PostgreSQL の接続数を状態別に確認して、idle in transaction が溜まっていないかなど、異常がないか見てください。",
  "Look into the disk usage": "ディスク使用を調べる",
  "Size per database, and whether WAL is piling up": "DB別サイズとWALの溜まりを確認する",
  "Find out how much disk PostgreSQL is using. Check the size of each database, whether WAL is piling up, and how much room is left on the host.": "PostgreSQL がディスクをどれだけ使っているかを調べてください。DB別のサイズと、WAL が溜まっていないか、ホストの空き容量を確認してください。",

  // pi.ts, files/session.ts, windows.ts, agent/secrets.ts
  "Pi does not know a service called {name}.": "{name} というサービスをPiが知りません。",
  "That skill cannot be read.": "そのスキルは読めません。",
  "The agent's runtime (Pi) could not be loaded: {detail}": "Agentの土台（Pi）を読み込めませんでした：{detail}",
  "{model} from {provider} could not be used. In the agent settings, sign in to that service or enter an API key for it.": "{provider} の {model} を使えませんでした。Agentの設定のモデルで、そのサービスにログインするか、APIキーを入れてください。",
  "Pi could not resolve the model “{name}”.": "モデル「{name}」をPiが解決できませんでした。",
  "({count} value that looked like a secret was hidden. The value itself went neither to the model nor into the record — open a session if you need to see it.)|({count} values that looked like secrets were hidden. The values themselves went neither to the model nor into the record — open a session if you need to see them.)": "（秘密らしい値を {count} 箇所伏せました。実際の値はモデルにも記録にも渡していません。必要ならセッションで確かめてください。）",
  "{path} cannot be opened: {reason}": "{path} を開けません：{reason}",
  "the home directory": "ホーム",
  "{path} cannot be read: {reason}": "{path} を読めません：{reason}",
  "SFTP is switched off on this server (the sshd Subsystem sftp line). SSH itself is working.": "このサーバでSFTPが無効になっています（sshd の Subsystem sftp）。SSH自体は通っています。",
  "SFTP will not open: {reason}": "SFTPを開けません：{reason}",
  "Task Scheduler": "タスク スケジューラ",
  "Windows Defender Firewall": "Windows Defender ファイアウォール",
  "{profile}: {state} (inbound defaults to {inbound})": "{profile}：{state}（受信の既定 {inbound}）",

  // agent/resources.ts, agent/riskHint.ts
  "A name may use letters, digits and - _ . only, up to 63 characters (Pi looks for the file under this name).": "名前は英数字と - _ . だけ、63文字までです（Piがこの名前でファイルを探します）。",
  "When to use it and what it does. The agent reads this line to choose.": "いつ使うか、何をするか。ここを読んでAgentが選びます。",
  "Steps": "手順",
  "What this prompt does": "このプロンプトが何をするか",
  "Name here the tools this extension registers, separated by spaces.": "ここにこの拡張が登録する道具の名前を書きます（空白区切り）。",
  "For example: // @tools recall remember": "例: // @tools recall remember",
  "Only the names written here reach the agent, and only once the settings allow them.": "書いた名前だけが、設定で許可したときにAgentへ渡ります。",
  "Steps in at the points of a run. The events you can use are in Pi's docs/extensions.md.": "実行の節目に割り込みます。使えるイベントは Pi の docs/extensions.md に。",
  "For example: keep a record, or stop the run when something holds": "例: 記録を残す、条件によっては止める",
  "To reach an outside service, register a tool here.": "外部のサービスにつなぐなら、ここで道具を登録します。",
  "Write it as npm:name, git:host/user/repository, https://… or an absolute path.": "npm:名前 / git:ホスト/ユーザ/リポジトリ / https://… / 絶対パス のいずれかで書いてください。",
  "This may be able to do more than read.": "実行力を持つ可能性があります",

  // RemoteAgentChat.tsx

  // agent/session.ts, RemoteAgentChat.tsx

  // AgentSettingsForm.tsx, RunsPane.tsx (the trace)
  "What is kept of each run":
    "実行ごとに残すもの",
  "Keep the whole conversation with the model":
    "モデルとのやり取りを全部残す",
  "Everything sent to the model and everything it said, run by run, beside the run's record on this machine. Nothing is sent anywhere for it. Open a run under \"Runs\" to write one out. A long run is a few hundred kilobytes; a very long one, a few megabytes.":
    "モデルへ送った内容と、モデルが返した内容を、実行ごとに実行の記録の隣へ残します。このために外へ送るものはありません。書き出すときは「実行の記録」で実行を開いてください。長い実行で数百KB、非常に長いものでも数MB程度です。",
  "What the model saw":
    "モデルが見たもの",
  "Everything sent to the model and everything it said, this run":
    "この実行でモデルへ送った内容と、モデルが返した内容の全部",
  "Write it out ({size})":
    "書き出す（{size}）",
  "The prompt and every turn, to read":
    "プロンプトと往復を、読む用に",
  "Every event as it arrived":
    "届いたイベントをそのまま",
  "The report was written.": "レポートを書きました。",
  "Write the report": "レポートを作る",
  "It has not been read yet: connect to this server, or press Read again.":
    "まだ読めていません。このサーバに接続するか、「読み直す」を押してください。",

  // PluginsSection.tsx, plugins/index.ts
  "There is no plugin called {id}.":
    "そのプラグインはありません：{id}",
  "Plugins":
    "プラグイン",
  "Plugins available":
    "使えるプラグイン",
  "No plugins.":
    "プラグインはありません。",
  "Installed, the knowledge above is always in the agent's view — the bodies are read only when needed. Removed, only what this plugin installed is deleted; anything you wrote yourself stays.":
    "入れると、上の知識は常にAgentの視界に入ります（本文は必要なときだけ読まれます）。外すと、このプラグインが入れたものだけが消え、あなたが書いたものは残ります。",
  "Plugins ship inside this application. Installing or removing one sends nothing over the network. What a plugin installed can also be seen under Skills.":
    "プラグインはこのアプリに同梱されています。入れても外しても、外へは何も送りません。プラグインが入れたものは「スキル」でも見られます。",
  "Nothing to put in here yet. A plugin brings investigations you can start with one press, and a sub-agent or a prompt appears here once you make one.":
    "ここに入れるものがまだありません。プラグインを入れると、ワンクリックで始められる調査が並びます。Agentやプロンプトを作ると、それもここに出ます。",
  "Look at the plugins":
    "プラグインを見る",
  "\"{name}\" looks like a fit for this server. Install it and the usual investigations are one click away.":
    "「{name}」がこのサーバに合いそうです。入れると、よくある調査がワンクリックになります。",
  "What to ask for when this is picked from the ＋ menu. Leave it out and it is knowledge only.":
    "＋メニューから選んだときに頼む文。書かなければ、知識としてだけ使われます。",
  "The skills it installs": "入るスキル",
  "in the ＋ menu": "＋メニューに出る",
  "`skills/<name>/SKILL.md`. The description in the frontmatter is the sentence the agent reads when choosing; add a `goal:` and the skill also appears in a conversation's ＋ menu, putting that line in the box.":
    "`skills/<名前>/SKILL.md`。frontmatter の description が、Agentが選ぶときに読む一文です。`goal:` を足すと、会話の＋メニューにも出て、その文が入力欄に入ります。",

  // plugins (adding one), resources (importing a skill)
  "This folder has no plugin.json.":
    "このフォルダに plugin.json がありません。",
  "A plugin that ships with the application is already called {id}.":
    "同梱のプラグインに、すでに {id} という名前があります。",
  "This folder has no skills directory.":
    "このフォルダに skills ディレクトリがありません。",
  "There is not one skill in this folder.":
    "このフォルダにスキルが1つもありません。",
  "A plugin may hold up to {count} skills.":
    "1つのプラグインに入れられるスキルは {count} 個までです。",
  "{name} has no SKILL.md.":
    "{name} に SKILL.md がありません。",
  "{name} is too large to read as a skill.":
    "{name} はスキルとして読むには大きすぎます。",
  "A plugin that ships with the application cannot be forgotten.":
    "同梱のプラグインは忘れさせられません。",
  "Choose the folder that holds plugin.json":
    "plugin.json のあるフォルダを選んでください",
  "There is no SKILL.md in that folder.":
    "そのフォルダに SKILL.md がありません。",
  "Choose a SKILL.md, or the folder that holds one":
    "SKILL.md か、それがあるフォルダを選んでください",
  "Reading…":
    "読み込み中…",
  "Add a plugin":
    "プラグインを追加",
  "Nothing is installed by adding it: the skills are written when you press Install. Read them first — a skill is text the agent will act on.":
    "追加しただけでは何も入りません。スキルが書かれるのは「入れる」を押したときです。先に中身を読んでください——スキルは、Agentがそのとおりに動く文章です。",
  "+ From a file":
    "＋ ファイルから",
  "+ From a folder": "＋ フォルダから",
  "+ Write a new one": "＋ 新しく書く",
  "Show or hide the screen": "画面の表示を切り替える",
  "Show or hide the session": "セッションの表示を切り替える",
  "{count} note|{count} notes": "分かったこと{count}件",
  "Written down in the logbook: {title}": "台帳に書きました：{title}",

  // KartePane.tsx (what earlier runs established)
  "What is known about this server":
    "このサーバについて分かっていること",
  "What earlier runs established":
    "これまでに分かったこと",
  "Nothing yet. As an investigation works something out, it writes it here — and the next run is handed it instead of finding it again.":
    "まだありません。調査で何か分かると、Agentがここに書きます。次の実行にはそれが渡るので、同じことを調べ直しません。",
  "Correct it":
    "直す",
  "The next run is handed what you save here.":
    "ここで保存した内容が、次の実行に渡ります。",
  "{count} of {most} kept. Past that, the oldest goes.":
    "{most} 件まで保持しています（現在 {count} 件）。超えると古いものから落ちます。",
  "Save as a file":
    "ファイルに保存",
  "The conversation was getting long, so what came before was summarised. What was written down in the logbook is kept in full.":
    "会話が長くなったので、これまでの分を要約にまとめました。台帳に書いたことは、そのまま残っています。",
  "Start a new conversation to change the model.":
    "モデルを変えるには、新しい会話を始めてください。",
  "Start a new conversation to change this.":
    "変えるには、新しい会話を始めてください。",

  // RemoteWorkspace.tsx (the clipboard)
  "Clipboard":
    "クリップボード",
  "What copy and paste has to work with on this server":
    "このサーバでのコピペの状態",
  "On this machine":
    "このMacにあるもの",
  "Nothing is copied.":
    "何もコピーされていません。",
  "To this server":
    "このサーバへ",
  "The clipboard channel is not open.":
    "クリップボードのチャンネルが開いていません。",
  "Offered, and the server took it at {when}.":
    "提示済み。{when} にサーバが取りに来ました。",
  "Offered at {when}. The server has not come for it — paste over there to pull it.":
    "{when} に提示しました。サーバはまだ取りに来ていません（向こうで貼り付けると取りに来ます）。",
  "Nothing has been offered yet.":
    "まだ何も提示していません。",
  "From this server":
    "このサーバから来たもの",
  "Offer it again":
    "もう一度送る",
  "Type it in":
    "文字として打ち込む",
  "Type it in — it goes where the cursor is":
    "打ち込む（カーソルのある場所に入ります）",
  "Typing stops at 2000 characters.":
    "打ち込みは2000文字までです。",
};
