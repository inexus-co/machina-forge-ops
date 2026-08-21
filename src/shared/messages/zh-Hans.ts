/**
 * Simplified Chinese.
 *
 * The key is the English sentence exactly as it stands in the source — see `shared/i18n.ts` for
 * why. A sentence absent here is shown in English, so an unfinished translation is visibly
 * unfinished rather than broken, and `i18n.test.ts` fails naming anything the screens ask for
 * that this file cannot answer.
 *
 * Two forms separated by `|` are singular and plural, chosen on `count`. `{name}` is filled in by
 * the caller and has to survive translation — a placeholder dropped here goes missing on screen.
 *
 * Shared characters between Japanese and Chinese make a literal reading tempting and wrong,
 * and English words have their own traps: an "extension" here is 扩展, a "package" is 软件包.
 */

import type { Messages } from "../i18n";

export const ZH_HANS: Messages = {

  // index.ts
  "Machina Forge Ops": "Machina Forge Ops",

  // controller.ts
  "That agent is not registered.": "该代理未登记。",
  "No model is registered for {name} to use.": "未登记 {name} 使用的模型。",
  "this machine": "本机",
  "That server is not registered.": "该服务器未登记。",
  "No model is registered. Add one in the settings.": "尚未登记模型。请在设置中添加模型。",
  "\"{name}\" has no address and no model name.": "「{name}」未填入连接目标与模型名。",
  "\"{name}\" has no API key set.": "「{name}」未设置 API 密钥。",
  "This machine can isolate. Running without isolation is not needed.": "本机具备隔离机制，不需要无隔离执行。",
  "That file cannot be opened.": "无法打开该文件。",
  "{name}-work-report.md": "{name}-工作报告.md",

  // diff.ts
  "@@ {count} unchanged lines @@": "@@ 未变更的 {count} 行 @@",

  // facts.ts
  "This server's state could not be read.": "无法读取此服务器的状态。",
  "{days}d": "{days} 天",
  "{hours}h": "{hours} 小时",
  "{minutes}m": "{minutes}分",
  "OS: {os}": "操作系统：{os}",
  "Up: {uptime}": "运行：{uptime}",
  "Load {load}": "负载 {load}",
  "{cores} cores": "{cores} 核",
  "CPU: {detail}": "CPU：{detail}",
  " (swap {used} / {total})": "（交换 {used} / {total}）",
  "Memory: {used} of {total} used{swap}": "内存：已用 {used} / {total}{swap}",
  " (over 80%)": "※超过 80%",
  "Disks: {disks}": "磁盘：{disks}",
  "{count} failed ({names}{more}), ": "失败 {count}（{names}{more}）、",
  " and more": " 等",
  "Services: {failed}{active} of {total} running": "服务：{failed}运行 {active} / {total}",
  "Containers: {running} running{names}{stopped}": "容器：运行 {running}{names}{stopped}",
  ", {count} stopped": " 已停止 {count}",
  "Ports reachable from outside: {ports}{more}": "外部可达的端口：{ports}{more}",
  "firewall: {kind} {state}": "firewall：{kind} {state}",
  "on": "已启用",
  "off": "未启用",
  " ({count} security)": "（安全更新 {count}）",
  "  restart needed": "　需要重启",
  "Updates: {count}{security}{reboot}": "更新：{count} 个{security}{reboot}",
  "Could not be read: {notes}": "未能读取：{notes}",
  "[State]": "【状态】",
  "[Inventory]": "【构成】",
  "Services in failure: {names}": "失败中的服务：{names}",
  "Every listening port:": "所有监听端口：",
  " (reachable from outside)": "（外部可达）",
  " (this machine only)": "（仅限本机内部）",
  "Scheduled jobs:": "定时执行：",
  "Images:": "镜像：",
  "Nothing could be read.": "没有可读取的信息。",

  // policy.ts
  "The command is empty.": "命令为空。",
  "The command is too long (up to {max} characters).": "命令过长（最多 {max} 个字符）。",
  "{what} cannot be used. Write one command on one line. Anything needing a pipe or a redirect is run by a person.":
    "不能使用 {what}。请在一行中只写一条命令。需要管道或重定向的处理，由人来执行。",
  "This agent ({name}) is not allowed sudo.": "此 Agent（{name}）不允许使用 sudo。",
  "sudo {option} has no value.": "sudo {option} 没有值。",
  "sudo {option} cannot be used.": "不能使用 sudo 的 {option}。",
  "There is no command after sudo.": "sudo 之后没有命令。",
  "Write the command by name rather than by path ({name}).": "请用命令名而不是路径来写（{name}）。",
  "{program} is not on this agent's list ({name}). It may use: {allowed}":
    "{program} 不在此 Agent（{name}）的许可列表中。可用的是 {allowed}。",
  "sudo is confirmed every time.": "sudo 每次都要确认。",
  "{program} can be impossible to undo.": "{program} 可能无法挽回。",
  "It points at a device.": "指向了设备。",
  "{name} may run {program} on its own only as: {verbs}": "{name} 可自动执行的只有 {program} {verbs}。",
  "{program} with no arguments. This list names the verbs it may use.":
    "以无参数执行 {program}。此许可列表指定了动词。",
  "{name} does not let {program} run on its own.": "{name} 未将 {program} 列为自动执行的对象。",
  "{program} is refused by {name}. Find another way.": "{program} 在{name}中被禁止。请另想办法。",
  "{program} is a kind of command that is never run — {summary}. Find another way.":
    "{program} 属于不允许执行的种类 — {summary}。请另想办法。",
  "{program} cannot be run on the server. Copy what you need across with fetch_log or read_file and work on it in run_local, where it is isolated.":
    "{program} 不能在目标服务器上执行。请用 fetch_log 或 read_file 把需要的数据复制到工作区，在 run_local（隔离）中处理。",
  "{program} {verb} can be impossible to undo.": "{program} {verb} 可能无法挽回。",
  "{program} {flag} can be impossible to undo.": "{program} {flag} 可能无法挽回。",
  "This reads the whole machine, end to end. It takes time, and it can slow down whatever that server is for.":
    "会从头到尾读取整台服务器。耗时较长，并可能影响正在运行的东西。",
  "It may run on its own only as: {program} {verbs}": "可自动执行的只有 {program} {verbs}。",
  "{program} is set to be confirmed every time.": "{program} 被设定为每次都要确认。",
  "This agent is set to confirm reads as well.": "此 Agent 设定为读取也要确认。",
  "It may run on its own only as a read: {program} {verbs}": "可自动执行的只有 {program} 的读取（{verbs}）。",
  "{program} can change the server.": "{program} 是可以改变服务器的命令。",
  "{program} is known here, but nobody has judged yet whether it reads or writes.":
    "已掌握 {program}，但尚未判断它是读取还是写入。",
  "Nothing has been decided about {program} yet.": "{program} 的处理方式尚未决定。",

  // prompt.ts
  "notes": "有备注",
  "{count} handover|{count} handovers": "交接 {count} 条",
  "{count} lines of facts": "事实摘要 {count} 行",
  "the facts could not be read": "无法读取事实",
  "nothing": "没有信息",
  "Handed over the logbook: {summary}": "已交付台账：{summary}",

  // report.ts
  "Finished": "已完成",
  "Stopped": "已停止",
  "Error": "错误",
  "Timed out": "超时",
  "Waiting for an answer": "等待回答",
  "Hit the limit": "达到上限",
  "not carried out: {reason}": "未执行：{reason}",
  "Fetched a log: {what}": "获取日志：{what}",
  "Fetched a file: {what}": "获取文件：{what}",
  "Ran a supporting task": "执行了辅助作业",
  "failed: {reason}": "失败：{reason}",
  "timed out": "超时",
  "run": "已执行",
  "exit code {code}": "退出码 {code}",
  "(no goal was written)": "（未记载目的）",
  "Not finished": "未完成",
  "Result": "结果",
  "What was done": "实施内容",
  "Period: {from} to {to}": "对象期间：{from} 〜 {to}",
  "the beginning": "最初",
  "now": "现在",
  "{host} — work report": "{host} 工作报告",
  "Written: {when}": "生成时间：{when}",
  "Runs: {count}": "执行数：{count}",
  "There were no runs in this period.": "此期间没有执行记录。",
  "Handovers": "交接记录",

  // resourcesController.ts
  "Catalogue": "目录",
  "Not one model is registered. Register one first.": "尚未登记任何模型。请先登记模型。",
  "Cancelled.": "已取消。",
  "Permission received. Finishing up…": "已收到授权。正在完成…",

  // review.ts
  "The model's answer was not JSON.": "模型的回答不是 JSON。",
  "The model's answer could not be read.": "无法读取模型的回答。",
  "The model returned no summary.": "模型没有返回摘要。",
  "The model could not be asked to read it: {reason}": "无法让模型读取：{reason}",

  // docker.ts
  "…(cut: too long)": "…（过长，已截断）",
  "The container could not be started: {reason}": "无法启动容器：{reason}",

  // serverContext.ts
  "That is not a valid host id: {id}": "无效的主机 ID：{id}",

  // session.ts
  "It is already running.": "已经在执行中。",
  "read the make-up and state again": "重新读取机器的构成与状态",
  "Send a goal first.": "请先发送目标。",
  "That did not reach the agent: {reason}": "这句话没有送到代理：{reason}",
  "Finished.": "已完成。",
  "Handed over {title}'s screen ({lines} lines).": "已交付{title}的画面（{lines} 行）。",
  "It cannot be cleared while running. Stop it first.": "执行中无法删除。请先停止。",
  "From now on, {what} will not be used on this server.": "今后在此服务器上不再使用 {what}。",
  "For this conversation, {what} will not be used.": "在本次对话期间不使用 {what}。",
  "From now on, {what} runs on its own on this server.": "今后在此服务器上自动执行 {what}。",
  "For this conversation, {what} runs on its own.": "在本次对话期间自动执行 {what}。",
  "Stopped by you": "已停止",
  "Used the extension's tool {name}.": "使用了扩展的工具 {name}。",
  "A file outside the working directory cannot be saved.": "无法保存工作目录之外的文件。",
  "That is not a file.": "这不是文件。",
  "Handed to {name}: {task}": "已交给 {name}：{task}",
  "{name} has reported back.": "{name} 已回报。",
  "This result was left in the handover.": "已把此结果留在交接记录中。",

  // store.ts
  "Model": "模型",
  "not named": "未指定",
  "Settings": "设置",

  // commandRunner.ts
  "The command could not be started: {reason}": "无法启动命令：{reason}",

  // controller.ts
  "A host name cannot contain URL punctuation.": "主机名不能包含 URL 符号。",
  "Session": "会话",
  "Enter the password.": "请输入密码。",
  "No SSH is set up for this server.": "此服务器未设置 SSH。",
  "Check this server's key first.": "请先确认此服务器的密钥。",
  "No key file has been chosen.": "尚未选择密钥文件。",
  "The key file cannot be read: {path}": "无法读取密钥文件：{path}",
  "Session {n}": "会话 {n}",
  "No session is open for this server.": "此服务器没有打开的会话。",
  "Choose a private key": "选择私钥",
  "Choose": "选择",
  "No RDP is set up for this server.": "此服务器未设置 RDP。",
  "This server is connected on the VNC screen. Disconnect that first.": "此服务器已通过 VNC 画面连接。请先断开。",
  "No screen (VNC) is set up for this server.": "此服务器未设置画面（VNC）。",
  "This server is connected on the RDP screen. Disconnect that first.": "此服务器已通过 RDP 画面连接。请先断开。",
  "Choose the files to send": "选择要上传的文件",
  "Send": "发送",
  "Choose where to save": "选择保存位置",
  "Save here": "保存到此处",
  "Servers": "服务器",

  // export.ts
  "CSV (spreadsheet)": "CSV（电子表格）",
  "Markdown (report)": "Markdown（报告）",
  "When": "时间",
  "Who": "执行者",
  "Command": "命令",
  "Output": "输出",
  "# Command history — {host}": "# 命令历史 — {host}",
  "Written out: {when}": "导出时间：{when}",
  "## Output": "## 输出",
  "Command history — {host}": "命令历史 — {host}",
  "Written out: {when} · {count} rows": "导出时间：{when}・{count} 条",
  "command-history_{host}_{stamp}": "命令历史_{host}_{stamp}",
  "Write out the command history": "导出命令历史",

  // hostKeys.ts
  "This server's key is not the one recorded. Either {where} was rebuilt, or it is a different server. Recorded {expected} / now {found}. If you rebuilt it, forget this server's key in the settings and then connect.":
    "此服务器的密钥与上次不同。{where} 可能被重建过，或者是另一台服务器。上次 {expected} / 本次 {found}。如果是重建过，请先在设置中让它忘记此服务器的密钥，再连接。",
  "The key at {where} was not trusted.": "未信任 {where} 的密钥。",

  // controller.ts
  "This server's reading was too long and stopped part way.": "此服务器的读取内容过长，中途被截断。",
  "This server's make-up cannot be read — it appears to be neither Linux nor Windows.":
    "无法读取此服务器的构成。看起来既不是 Linux 也不是 Windows。",
  "That log cannot be opened.": "无法打开该日志。",
  "The log cannot be opened: {reason}": "无法打开日志：{reason}",

  // jump.ts
  "Jump server: {reason}": "跳板机：{reason}",
  "The jump server cannot reach {where}: {reason}": "无法从跳板机连接到 {where}：{reason}",

  // wayIn.ts (the providers' table), tunnel.ts, and the host form's tabs
  "Screen": "画面",
  "SSH": "SSH",
  "RDP and VNC": "RDP 与 VNC",
  "The account, the key, tmux": "账号、密钥、tmux",
  "When it cannot be reached directly": "直接连不上时",
  "Go in through another server": "经由另一台服务器进入",
  "Straight to an address": "写地址，直接连",
  "Machine name": "机器名称",
  "A command that ends in a shell": "最终给出 shell 的命令",
  "It runs on this machine, as you. What comes back has to be a shell — the command is not given one, so a pipe or a semicolon here is a character, not a second command.":
    "在这台机器上、以你的身份运行。返回的必须是一个 shell。命令本身不经过 shell，所以这里写的管道或分号只是字符，不是第二条命令。",
  "A provider's command runs on this machine, as you, with the credentials you already use with them, and what comes back is a shell — so there is no account, no key and no host key here, and no files panel either. A jump server is not used as well.":
    "服务商的命令在这台机器上、以你的身份、用你在该服务商一直使用的凭据运行。返回的是一个 shell，所以这里没有账号、没有密钥、也没有主机密钥确认，文件面板也用不了。跳板机不与它同时使用。",
  "Files are not available on a server reached by the provider's own command: that way in gives a shell, and file transfer needs SSH.":
    "用服务商命令进入的服务器，文件面板用不了：那条路给的是 shell，而传文件需要 SSH。",
  "{label} (only if needed)": "{label}（需要时才填）",
  "Fill in {label} for the way in.": "请填写入口的「{label}」。",
  "This server's way in is not filled in.": "这台服务器的入口没有填写。",
  "{program} is not installed on this machine, or is not on the PATH.":
    "这台机器上没有装 {program}，或者它不在 PATH 里。",
  "{program} said: {said}": "{program} 的回复：{said}",
  "It ended without saying why.": "它没说原因就结束了。",
  "The shell on the other end ended: {reason}": "对端的 shell 结束了：{reason}",
  "The way in could not be opened: {reason}": "打不开入口：{reason}",
  "The way in did not open in time: {reason}": "入口没有在时限内打开：{reason}",
  "Instance ID": "实例 ID",
  "Region": "区域",
  "Profile": "配置档",
  "Instance name": "实例名",
  "Zone": "可用区",
  "Project": "项目",
  "Resource group": "资源组",
  "Something else": "其他",


  // fileTransfer.ts (how a file gets across) and its tab
  "Saved.": "已保存。",
  "File transfer": "文件传输",
  "For the ones too big for the connection": "线路载不下的时候",
  "Fill in {label} for file transfer.": "请填写文件传输的「{label}」。",
  "Straight down the connection": "直接走这条线路",
  "Over SSH that is SFTP. Over a shell handed back by a provider's command there is no SFTP, so the file travels as text down the same stream — which suits a configuration file and not a database dump.":
    "SSH 就是 SFTP。服务商命令返回的 shell 没有 SFTP，文件只能以文本形式走同一条流。适合配置文件，不适合数据库导出。",
  "Where to leave it": "存放位置",
  "Both machines need the AWS CLI and permission for that prefix — the server's from the role its instance already has, yours from the profile you already use.":
    "两台机器都需要 AWS CLI 和该位置的权限。服务器一侧来自实例本来就有的角色，你这边来自你一直使用的配置档。",
  "Both machines need the Google Cloud CLI and permission for that prefix.":
    "两台机器都需要 Google Cloud CLI 和该位置的权限。",
  "Storage account": "存储账户",
  "Both machines need the Azure CLI and permission on that container.":
    "两台机器都需要 Azure CLI 和该容器的权限。",
  "Somewhere else": "其他存放位置",
  "The command that puts a file there": "放上去的命令",
  "The command that gets it back": "取回来的命令",
  "Both run on whichever machine is sending or fetching, so both have to work on both. {f} is the file on that machine, {n} the name in the store.":
    "送和取都用这两条，所以两台机器上都要能跑。{f} 是那台机器上的文件，{n} 是存放位置里的名字。",
  "Nothing of the store's is kept here — each machine uses the credentials it already has, and what is left in it is removed once the file is across. The seven steps of changing a file are the same either way: the real file is fetched, copied on both sides, and the difference goes on an approval card before anything is written.":
    "存放位置的凭据不保存在这里，各自的机器用它本来就有的。传完就清掉。改文件的七步两边都一样：取回实际文件、两侧各留副本、差异先上审批卡，然后才写回。",

  // localeController.ts
  "That is not a language this can use.": "无法处理该语言。",

  // window.ts
  "{label} — {host}": "{label} — {host}",

  // rdpSession.ts
  "This build has no screen (RDP) viewer in it. Sessions over SSH, files and the agent all still work.":
    "此版本未包含画面（RDP）的显示部分。SSH 的会话、文件与 Agent 仍可照常使用。",
  "The RDP helper has not been built. Run native/rdp/build.sh (FreeRDP 3 is required).":
    "RDP 辅助程序尚未构建。请执行 native/rdp/build.sh（需要 FreeRDP 3）。",
  "This server's certificate is not the one recorded. Either {where} was rebuilt, or it is a different server. If you rebuilt it, forget this server's key in the settings and then connect.":
    "此服务器的证书与上次不同。{where} 可能被重建过，或者是另一台服务器。如果是重建过，请先在设置中让它忘记此服务器的密钥，再连接。",
  "The helper exited ({code})": "辅助程序已退出（{code}）",
  "The clipboard contents are too large.": "剪贴板的内容过大。",
  "The screen stream lost its place.": "画面接收失去了同步。",

  // controller.ts
  "The recording cannot be read.": "无法读取录制的内容。",
  "There is no such recording.": "没有该录制。",
  "Write out the recording": "导出录制",
  "screen-recording_{host}_{stamp}": "画面录制_{host}_{stamp}",
  "WebM (video)": "WebM（视频）",

  // store.ts
  "That recording is no longer open.": "该录制已不再打开。",
  "Stopped: it grew too large.": "因过大而停止。",
  "The recording grew too large and was stopped.": "录制过大，已停止。",
  "That name points outside the recording.": "该名称指向录制之外。",

  // sshSession.ts
  "A shell could not be opened: {reason}": "无法打开 shell：{reason}",
  "reason unknown": "原因不明",
  "tmux is not available; opening an ordinary shell.": "没有 tmux，将打开普通的 shell。",
  "The other end could not be verified: its key differs from the one recorded, or you answered that you do not trust it.":
    "无法确认连接目标。密钥与上次不同，或你回答了不信任。",
  "The key file cannot be read. Check its format, or the passphrase.": "无法读取密钥文件。请确认格式或口令。",
  "The key needs a passphrase.": "该密钥需要口令。",
  "Signing in failed. Check the user name, and the password or the key.": "认证失败。请确认用户名，以及密码或密钥。",
  "The connection was refused. Check that SSH is running.": "连接被拒绝。请确认 SSH 是否在运行。",
  "No answer. Check the address and the port.": "没有响应。请确认地址与端口。",
  "The host name cannot be resolved.": "无法解析主机名。",

  // controller.ts
  "This server's state cannot be read — it appears to be neither Linux nor Windows.":
    "无法读取此服务器的状态。看起来既不是 Linux 也不是 Windows。",

  // bridge.ts
  "The key at the other end differs. Expected {expected} / found {found}":
    "连接目标的密钥不符。期望 {expected} / 实际 {found}",
  "Nothing to connect to was handed over.": "未传入连接目标。",
  "Connecting to {where}…": "正在连接 {where}…",
  "— The connection has ended. You can close this window.": "— 连接已结束。可以关闭此窗口。",

  // rfb.ts
  "The screen data is too large.": "画面数据过大。",
  "The connection was refused.": "连接被拒绝。",
  "This server asked for a way of signing in that is not supported.": "此服务器要求了不支持的认证方式。",
  "This server's sign-in parameters are not valid.": "此服务器的认证参数不正确。",
  "Could not answer this server's sign-in (Apple).": "无法响应此服务器的认证（Apple）。",
  "Could not answer this server's sign-in (UltraVNC).": "无法响应此服务器的认证（UltraVNC）。",
  "This server's VeNCrypt ({version}) is not supported.": "不支持此服务器的 VeNCrypt（{version}）。",
  "This server would not accept VeNCrypt 0.2.": "此服务器不接受 VeNCrypt 0.2。",
  "This server offered no way of signing in that can be used.": "此服务器没有返回可用的认证方式。",
  "This server refused to connect over TLS.": "此服务器拒绝了 TLS 连接。",
  "Either the password is wrong, or the sign-in was refused.": "密码错误，或认证被拒绝。",
  "Part of the screen points outside the screen.": "画面的一部分指向画面之外。",
  "The screen could not be decompressed.": "画面解压失败。",
  "Unsupported encoding ({encoding}).": "不支持的编码（{encoding}）。",
  "The screen size is not valid ({width}×{height}).": "画面尺寸不正确（{width}×{height}）。",

  // security.ts
  "This server's VNC asks to connect over anonymous TLS, which is TigerVNC's default. That way is not supported. Either set up an X509 certificate on the server, or go through a jump server and allow sending in the clear in the settings.":
    "此服务器的 VNC 要求使用匿名 TLS 连接（TigerVNC 的默认设置）。本应用不支持该方式。请在服务器端配置 X509 证书，或经由跳板机并在设置中允许以明文发送。",
  "This server wants a user name and a password. Fill them in under the connection settings.":
    "此服务器需要用户名与密码。请在连接设置中填入。",
  "This server asked for a way of signing in that is not supported ({types}).":
    "此服务器要求了不支持的认证方式（{types}）。",
  "This server accepts only Plain, which sends the password in the clear. If you are inside a jump server or a VPN, tick \"Allow the password to be sent in the clear\" in the connection settings.":
    "此服务器只接受以明文发送密码的方式（Plain）。如果是在跳板机或 VPN 内部使用，请在连接设置中勾选「允许以明文发送密码」。",
  "This server wants a user name. Fill it in under the connection settings.":
    "此服务器需要用户名。请在连接设置中填入。",

  // zrle.ts
  "The ZRLE data is incomplete.": "ZRLE 的数据不足。",
  "Unsupported ZRLE tile ({tile}).": "不支持的 ZRLE 图块（{tile}）。",

  // vncSession.ts
  "Could not reach {where} (timed out).": "无法连接 {where}（超时）。",
  "The connection to {where} went away.": "与 {where} 的连接已断开。",
  "{where} presented no certificate.": "{where} 没有出示证书。",
  "Encryption (TLS) with {where} failed: {reason}": "与 {where} 的加密（TLS）失败：{reason}",
  "{where} refused the connection. Check that VNC is running and that the port is right.":
    "{where} 拒绝了连接。请确认 VNC 是否在运行、端口是否正确。",
  "{where} cannot be reached. Check the route and the firewall.": "无法到达 {where}。请检查路由与防火墙。",
  "No server by the name {where} could be found.": "找不到名为 {where} 的服务器。",
  "{where} cut the connection.": "与 {where} 的连接被切断。",
  "Connecting to {where} failed.": "连接 {where} 失败。",

  // secretStore.ts
  "Credentials cannot be encrypted on this machine. Rather than write a password out in the clear, nothing was saved.":
    "此环境无法加密保存凭据。为了不以明文写出密码，已中止保存。",
  "The saved credentials cannot be read. They may have been encrypted by another user, or on another machine.":
    "无法读取已保存的凭据。可能是由其他用户或其他机器加密的。",
  "The saved credentials are not in a shape this can read.": "已保存的凭据格式不正确。",

  // screenCapture.ts
  "This screen cannot be recorded.": "此画面无法录制。",

  // ErrorBoundary.tsx
  "This screen could not be drawn": "无法显示此画面",
  "Nothing was sent to the machine you are working on. Reload, or look at the developer console for the cause.":
    "没有向目标电脑发送任何操作。请重新载入，或在开发者工具的控制台查看原因。",
  "Reload": "重新载入",

  // AgentSettingsForm.tsx
  "A browser has opened. Give permission there.": "已打开浏览器。请在那里授权。",
  "A browser has opened. Type this code into it.": "已打开浏览器。请在那个画面输入此代码。",
  "Who the agent asks. It is the same for every server, and each run can pick one from the conversation's menu. What gets sent is the goal you wrote, the commands the agent ran and what came back. Where a customer's output ends up differs by model, so check before choosing.":
    "这是 Agent 向谁提问。对所有服务器通用，每次执行可从对话菜单中选择。发送出去的是你写的目标、Agent 执行的命令及其输出。客户服务器的输出会去到哪里，因模型而异，选择前请先确认。",
  "Registered": "已登记",
  "+ Add a model": "＋ 添加模型",
  "None yet. Until one is added, the agent cannot run.": "还没有。添加一个之前，Agent 无法执行。",
  "Make it the default": "设为默认",
  "(no name)": "（无名称）",
  "Delete": "删除",
  "Model settings": "模型的设置",
  "New model": "新的模型",
  "Close": "关闭",
  "What to call it (it appears in the conversation's menu)": "称呼（会出现在对话菜单中）",
  "Our GPU box / the GPT subscription": "公司内部 GPU 机 / 已签约的 GPT",
  "How will you use it?": "要如何使用？",
  "Through a subscription": "使用签约套餐",
  "ChatGPT, Claude and the like, paid monthly. You sign in": "ChatGPT、Claude 等按月签约的服务。需要登录",
  "With an API key": "使用 API 密钥",
  "Gemini, OpenAI, our own GPU box. You fill in a URL and a key":
    "Gemini、OpenAI、公司内部 GPU 机。需填入 URL 与密钥",
  "Service": "服务",
  "Sign out": "登出",
  "Starting the sign-in…": "正在开始登录…",
  "Signed in.": "已登录。",
  "Could not sign in. Try again — if the browser page is still open, close it first.":
    "登录失败。请再试一次。如果浏览器画面还开着，请先关闭再按。",
  "Sign in": "登录",
  "Signing in…": "登录中…",
  "Model ID (empty means {model})": "模型 ID（留空则为 {model}）",
  "Model ID (the name that service calls it)": "模型 ID（该服务自己使用的名称）",
  "The URL to reach (ending in /v1)": "连接目标的 URL（末尾为 /v1）",
  "API key (encrypted and kept on this machine)": "API 密钥（在本机加密保存）",
  "Saved. Type only to change it": "已保存。仅在更改时输入",
  "Forget the saved key": "删除已保存的密钥",
  "It can read images (an agent that works the screen needs this)": "可以读取图像（操作画面的 Agent 需要此项）",
  "Cancel": "取消",
  "Save": "保存",
  "Add": "添加",
  "Saving…": "保存中…",
  "Run here": "本机执行",
  "The agent can do its analysis and write files in an isolated workspace inside this machine. What that workspace allows is chosen here.":
    "Agent 可以在本机内隔离的工作区中进行分析和生成文件。此处选择该工作区的规则。",
  "Isolation": "隔离",
  "The agent can do its analysis and write files in an isolated workspace inside this machine. It has no network there, cannot write outside the workspace, and cannot read your home. What reaches the server is still one allowed command at a time.":
    "Agent 可以在本机内隔离的工作区中进行分析和生成文件。那里没有网络，无法写到工作区之外，也读不到你的主目录。到达服务器的，仍然只有被允许的一行命令。",
  "How to isolate": "隔离方式",
  "Match this machine (recommended)": "按本机自动选择（推荐）",
  "macOS isolation (sandbox-exec)": "macOS 的隔离（sandbox-exec）",
  "Linux isolation (bubblewrap)": "Linux 的隔离（bubblewrap）",
  "If the isolation you chose cannot be built on this machine, running here is switched off altogether. It is not a limit that a setting can loosen. Choosing Docker requires the image to be here already — nothing is fetched at run time.":
    "如果本机无法准备所选的隔离方式，本机执行本身将被禁用。这不是可以通过设置放宽的限制。选择 Docker 时，所用镜像必须已在本地（不会在每次执行时去拉取）。",
  "Isolation on this machine: {wall}": "本机的隔离：{wall}",
  "This machine has no way to isolate.": "本机没有隔离机制。",
  "Turn this on and the commands the agent writes run": "启用后，Agent 写出的命令将",
  "on this machine, with your own privileges": "以你的权限，在本机上",
  ". Your customers' saved credentials and the models' API keys are within reach of those privileges. To get isolation back, install WSL2 or Docker.":
    "被执行。已保存的客户凭据与模型的 API 密钥也在该权限范围内。要恢复隔离，请安装 WSL2 或 Docker。",
  "Even switched on, running here still needs": "即使启用，本机执行仍然",
  "approval line by line": "逐行批准",
  "(the automatic setting does not change this). The record keeps the fact that it ran without isolation.":
    "（自动执行的设置也不改变这一点）。执行记录中会留下在无隔离状态下执行的事实。",
  "Take responsibility and allow running without isolation": "自行承担责任，启用无隔离执行",
  " on this machine (": " 在本机（",
  ").": "）上启用。",
  "default": "默认",
  "Nowhere to connect": "无连接目标",
  "No model named": "未指定模型名",
  " · no key set": "・未设置密钥",
  "Paste the API key.": "请粘贴 API 密钥。",
  "Which one shall it be?": "要用哪一个继续？",
  "Paste the code the browser shows after you allow it (or the URL it sends you back to).":
    "请把在浏览器授权后出现的代码（或返回的 URL）粘贴到这里。",
  "Sign in to {service}": "登录 {service}",
  "If it will not work, paste the code": "不成功时，粘贴代码",

  // CatalogSection.tsx
  "Automatic": "自动",
  "Runs without asking (destructive ones and sudo are always asked)": "不询问直接执行（破坏性的与 sudo 始终询问）",
  "Partly automatic": "部分自动",
  "Runs without asking only in the forms that read": "仅在属于读取的写法下不询问直接执行",
  "Ask": "确认",
  "Asks a person before every run": "每次执行前都询问人",
  "Refused": "禁止",
  "Refused without asking, and the reason goes back into the conversation": "不询问直接拒绝，理由会返回到对话中",
  "A command the catalogue does not have": "目录中没有的命令",
  "Command knowledge": "命令知识",
  "This application knows {linux} commands on Linux and {windows} on Windows. The ones that read run on their own, the ones that change a server are asked about, and the ones that destroy always go to a person. To treat a command differently, press its button in the list.":
    "本应用掌握 Linux {linux} 个、Windows {windows} 个命令。读取类自动执行，会改变服务器的会先询问，破坏性的一定交给人决定。要改变某个命令的处理方式，直接在列表中按下按钮。",
  "Loading…": "载入中…",
  "Rules for everything": "总体规则",
  "Run commands that only read without asking": "读取类命令不询问直接执行",
  "Allow sudo (approved each time it is used)": "允许 sudo（每次使用都需要批准）",
  "List": "列表",
  "Search the name or the description (e.g. systemctl, log)": "按名称或说明搜索（例：systemctl、日志）",
  "All": "全部",
  "Show only what you treat differently from the catalogue": "只看与目录不同处理的项目",
  "Decided by you {count}": "自行决定的 {count}",
  "{note} (automatic: {verbs})": "{note}（自动：{verbs}）",
  "Decided by you": "自行决定的",
  "{count} more. Narrow the search.": "还有 {count} 个。请缩小范围。",
  "You have not overridden anything. The catalogue's judgement stands.": "没有自行决定的项目。按目录的判断运行。",
  "Nothing found. A command nobody knows can still be run — it stops first and you decide.":
    "找不到。未知的命令同样可以执行——执行前会停下，由你决定。",
  "What is remembered per server": "按服务器记住的内容",
  "Clear": "清除",
  "What you chose under \"from now on\" on an approval card during a run. It applies to that server only. Entries cannot be edited one by one — clear them and decide again on the next run.":
    "这是执行中在批准卡片上选择「今后…」的内容，只对那台服务器有效。无法逐条修改——请清除后在下次执行时重新决定。",

  // FilesPane.tsx
  "No SSH is set up for this server, so files cannot be handled.": "此服务器未设置 SSH，无法处理文件。",
  "↑ Up": "↑ 上一层",
  "+ Send": "＋ 上传",
  "↓ Fetch ({count})": "↓ 接收（{count}）",
  "↓ Fetch": "↓ 接收",
  "This directory is empty.": "这是空目录。",
  "Abort": "中止",
  "Open": "打开",

  // FleetPane.tsx
  "Step by step": "逐条批准",
  "Automatic (destructive and sudo still asked)": "自动（破坏性与 sudo 仍需批准）",
  "Plan only (runs nothing)": "仅计划（不执行）",
  "Run across servers": "批量执行",
  "Hands the same goal to every server you picked. Each run is on its own — one failure does not touch the others. Each server's record still applies.":
    "把同一个目标一次交给选中的服务器。每台独立执行——一台失败不影响其他。各服务器的台账照常生效。",
  "Servers ({count})": "服务器（{count} 台）",
  "No server here has anywhere to connect to.": "没有已配置连接目标的服务器。",
  "Goal": "目标",
  "e.g. Restart nginx and check whether the 502s stopped": "例：重启 nginx，并确认 502 是否消失",
  "How to approve": "批准方式",
  "Start on {count}": "对 {count} 台开始",
  "Open this server's conversation": "打开此服务器的对话",
  "Set up another run": "组建另一次批量执行",
  "Waiting": "待机",
  "Waiting for approval": "等待批准",
  "Command {n}, running…": "第 {n} 条　执行中…",
  "Running…": "执行中…",
  "Done": "完成",
  "It has a question": "有提问",

  // GlobalSettings.tsx
  "Sub-agents": "子代理",
  "Skills": "技能",
  "Prompts": "提示词",
  "Instructions": "指示",
  "Extensions": "扩展",
  "Packages": "软件包",
  "Server keys": "服务器密钥",
  "Language": "语言",

  // HostForm.tsx
  "Turn on a screen (RDP or VNC) or SSH.": "请至少启用画面（RDP / VNC）或 SSH 之一。",
  "Enter the RDP host.": "请输入 RDP 的主机。",
  "Enter the VNC host.": "请输入 VNC 的主机。",
  "Enter the SSH host.": "请输入 SSH 的主机。",
  "Choose where the private key is.": "请选择私钥的位置。",
  "This server's settings": "此服务器的设置",
  "Connection": "连接",
  "Address and account": "地址与账号",
  "Sign-in": "认证",
  "Password or private key": "密码或私钥",
  "Route": "经由",
  "Jump server": "跳板机",
  "tmux and keeping it open": "tmux 与保持",
  "Name": "名称",
  "Customer A, main server": "客户A 核心服务器",
  "RDP (screen)": "RDP（画面）",
  "Host": "主机",
  "Port": "端口",
  "User": "用户",
  "Password": "密码",
  "RDP password": "RDP 的密码",
  "VNC (screen)": "VNC（画面）",
  "User (only if needed)": "用户（仅在需要时）",
  "Usually left empty": "通常留空即可",
  "VNC password": "VNC 的密码",
  "Ordinary VNC takes a password and no user name. Fill this in only for the servers that use one — TigerVNC, macOS screen sharing, UltraVNC.":
    "普通的 VNC 只要密码，不需要用户名。只有 TigerVNC、macOS 屏幕共享、UltraVNC 等使用用户名的服务器才需要填写。",
  "Allow the password to be sent in the clear": "允许以明文发送密码",
  "Only needed for VNC servers that cannot encrypt. With this on, this server's password crosses the network as it is. Allow it only inside a jump server or a VPN.":
    "仅对无法加密的 VNC 服务器需要。开启后，此服务器的密码将以原样通过网络传输。请仅在跳板机或 VPN 内部允许。",
  "SSH (session)": "SSH（会话）",
  "Open inside tmux on the server (what is running there survives a dropped line)":
    "在服务器端的 tmux 中打开（线路断开后，那边的执行仍继续）",
  "Keep it on this machine (the session survives Forge closing)": "在此工作电脑上保持（Forge 关闭后会话仍留存）",
  "Unavailable: this machine has no tmux": "此工作电脑没有 tmux，无法使用",
  "Private key": "私钥",
  "SSH password": "SSH 的密码",
  "Choose a key": "选择密钥",
  "Passphrase (if the key has one)": "口令（如果密钥设置了）",
  "Leave empty if there is none": "没有就留空",
  "Jump server (when this one cannot be reached directly)": "跳板机（无法直接连接此服务器时）",
  "None (connect directly)": "不使用（直接连接）",
  "No server here can act as a jump server yet.": "还没有可作为跳板机的服务器。",
  "A jump server is registered like any other server": "跳板机也作为一台服务器登记",
  "Fill in SSH and add it, and it becomes selectable here.": "填入 SSH 并添加后，就可以在这里选择。",
  "Register a jump server": "登记跳板机",
  "Pick another server from the list. Its password, its key and its fingerprint are used exactly as registered.":
    "从列表中选择另一台服务器。该服务器的密码、密钥与指纹将按已登记的内容直接使用。",
  "Passwords and passphrases are encrypted into this machine's keystore and never come back to the screen. Save with the box empty and the stored one is kept. The private key itself is not copied — it is read from where you chose, each time you connect.":
    "密码与口令会加密保存在本机的密钥库中，不会回到画面上。留空保存则沿用已保存的内容。私钥本身不会被复制，每次连接时从你选定的位置读取。",
  "Delete this server": "删除此服务器",

  // HostStatusPanel.tsx
  "Without SSH the state cannot be read.": "未设置 SSH，无法读取状态。",
  "Reading the state…": "正在读取状态…",
  "Measuring": "测量中",
  "Memory": "内存",
  "Disk {mount}": "磁盘 {mount}",
  "Disk": "磁盘",
  "1 min / 5 min / 15 min": "1分 / 5分 / 15分",
  "Above the core count": "超过核心数",
  "Up {uptime}": "运行 {uptime}",
  "Collapse": "折叠",
  "Details": "详细",
  "Own window": "独立窗口",
  "Host name": "主机名",
  "Kernel": "内核",
  "As of {when}, read over SSH — nothing is installed on the server.":
    "{when} 时点。通过 SSH 读取——服务器上没有安装任何东西。",
  "{days}d {hours}h": "{days}天 {hours}小时",
  "{hours}h {minutes}m": "{hours}小时 {minutes}分",

  // InventoryPane.tsx
  "Scheduled jobs": "定时执行",
  "Containers": "容器",
  "Logs": "日志",
  "No SSH is set up for this server, so nothing can be read.": "此服务器未设置 SSH，无法读取。",
  "{count} updates": "更新 {count}",
  " ({count} of them security)": "（其中安全更新 {count}）",
  "A restart is needed": "需要重启",
  "Not read yet.": "还没有读取。",
  "Listening": "监听",
  "Process": "进程",
  "Reachable from outside": "外部可达",
  "This machine only": "仅限本机内部",
  "Process names are only visible to an account with the privilege.": "进程名只有具备权限的账号才能看到。",
  "Only what is running": "只看运行中的",
  "Everything, stopped ones too ({count})": "包含已停止的全部（{count}）",
  "No scheduled jobs are set.": "没有定时执行的设置。",
  "Neither Docker nor Podman was found.": "没有找到 Docker 或 Podman。",
  "Image": "镜像",
  "No firewall was found": "没有找到 firewall",
  "not in force": "未生效",
  "There is no log that can be read": "没有可读取的日志",
  "Only lines containing this text": "仅包含此文字的行",
  "■ Stop": "■ 停止",
  "▶ Follow": "▶ 跟随",
  "Waiting…": "正在等待…",
  "Press Follow to show it. It starts with the last 300 lines and then keeps up with whatever arrives.":
    "按「跟随」显示。先从最近 300 行开始，之后持续显示新到的内容。",

  // KartePane.tsx
  "Server logbook": "服务器台账",
  "What you see here is handed to the agent at the start of its next run.":
    "此处显示的内容，会在下次执行开始时交给 Agent。",
  "Your notes": "操作者的备注",
  "What the agent should know about this server (e.g. production DB is web-db; be careful about restarts)":
    "关于这台服务器，希望 Agent 知道的事（例：生产数据库是 web-db，重启需谨慎）",
  "There are unsaved changes": "有未保存的更改",
  "Saved": "已保存",
  "Handover": "交接记录",
  "None yet. Every run that ends in done leaves its summary here.": "还没有。每次执行以 done 结束时，其摘要会留在这里。",
  "Delete this handover": "删除此交接记录",
  "The facts handed to the agent (summary)": "交给 Agent 的事实（摘要）",
  "as of {when}": "{when} 时点",
  "Read again": "重新读取",
  "With no SSH, the agent is handed the screen and nothing else.": "由于没有 SSH，只有画面会交给 Agent。",
  "Could not read it just now: {reason}": "此刻无法读取：{reason}",
  "(nothing could be read)": "（没有可读取的信息）",
  "Show all": "全部展开",
  "Collapse all": "全部折叠",
  "What is remembered for this server": "此服务器记住的内容",
  "None yet. Choosing \"from now on\" on an approval card during a run collects them here.":
    "还没有。在执行中的批准卡片上选择「今后…」，就会累积在这里。",
  "Clear everything remembered for this server": "清除此服务器记住的全部内容",

  // KitsSection.tsx
  "How to look into the usual set-ups, installed in one go. Once in, the knowledge reaches the agent and the standard investigations are ready in the chat's + menu. Nothing to configure. Permissions and behaviour do not change — what may be run is still the setting for the whole installation.":
    "可以一次性装入常见构成的排查方法。装入后，这些知识对 Agent 生效，并可从对话的＋菜单立即开始定型排查。无需细节设置。权限与行为不变——可以执行什么，仍然是整个安装的设置。",
  "installed": "已装入",
  "Remove": "移除",
  "Removing…": "移除中…",
  "Install": "安装",
  "Installing…": "安装中…",
  "What it installs (knowledge)": "装入的内容（知识）",
  "What it can look into (one click from the chat)": "可做的排查（从对话一键开始）",

  // KnownHostsSection.tsx
  "The fingerprint recorded the first time you connected. From then on this application refuses any server that presents a different key. Forget one here only when you have rebuilt that server.":
    "这是首次连接时记录的指纹。之后本应用不会连接出示不同密钥的服务器。只有在重建服务器后，才在此让它忘记。",
  "Recorded keys": "已记录的密钥",
  "Nothing recorded yet.": "还没有记录任何一台。",
  "Forget": "忘记",

  // LanguageSection.tsx
  "This changes the words on screen, how dates and numbers are written, and the messages this application shows you. The agent answers you in the language you choose here as well.":
    "会改变界面文字、日期与数字的写法，以及本应用向你显示的提示。Agent 回答你时也会使用所选语言。",
  "The language could not be changed.": "无法更改语言。",
  "Anything not yet translated appears in Japanese. The agent's own instructions — what it may run, what it has to ask a person about — stay in Japanese in every language: four copies of the safety rules would mean one of them going stale.":
    "尚未翻译的部分仍以日文显示。给 Agent 本身的指示（可以执行什么、必须先问人什么）在任何语言下都保持日文——安全规则若分成四份，其中一份终会过时。",
  "The language this application was written in.": "本应用最初书写所用的语言。",
  "Shows everything in English.": "以英文显示。",
  "Simplified characters, as used in mainland China.": "以中国大陆使用的简体字显示。",
  "Traditional characters, as used in Taiwan and Hong Kong.": "以台湾、香港使用的繁体字显示。",

  // ProfilesSection.tsx
  "Unnamed agent": "未命名的 Agent",
  "A model, an instruction and a way of approving, kept together under a name. You can pick one in a conversation, or hand work to it from another sub-agent. What it may run is not decided here — every one of them follows the rules under Command knowledge.":
    "把模型、指示与批准方式合为一组并命名。可以在对话中选用，也可以由其他子代理把工作交给它。可以执行什么不在此决定——所有子代理都遵循「命令知识」中的规则。",
  "+ Add an agent": "＋ 添加代理",
  "None yet. If there is work you do often, you can name the combination and keep it here.":
    "还没有。如果有经常做的工作，可以给这个组合起个名字留在这里。",
  "Sub-agent settings": "代理的设置",
  "New agent": "新的代理",
  "Read the logs only / fix production": "只看日志 / 修复生产环境",
  "Run commands (SSH)": "执行命令（SSH）",
  "Work the screen (RDP)": "操作画面（RDP）",
  "It works the screen with a mouse and a keyboard. This agent": "用鼠标与键盘操作画面。此 Agent",
  "cannot run any command at all": "完全不能执行任何命令",
  "— if it could open a shell on the screen and type, the rules about commands would mean nothing. Servers without SSH are looked after this way. For anything that stops a service, use Approve each one and watch it action by action.":
    "——如果它能在画面上打开 shell 输入，关于命令的规则就失去意义了。没有 SSH 的服务器用这种方式照看。会停掉服务的操作，请用「逐条批准」逐个操作确认。",
  "The default model": "默认模型",
  "Who it may hand work to (optional)": "可以委派的对象（可选）",
  "Whoever is handed the work uses its own model and its own command rules. It cannot hand the work on again.":
    "被委派者使用自己的模型与自己的命令规则。被委派者不能再往下委派。",
  "Instructions for this agent (optional)": "给此 Agent 的指示（可选）",
  "e.g. On production, always say why before stopping anything": "例：在生产环境，停止任何东西前必须先说明理由",
  "Works the screen": "操作画面",
  "Runs commands": "执行命令",

  // RemoteAgentChat.tsx
  "Stopped: too many commands (if it is not finished, ask again)": "命令过多，已停止（若尚未完成，请再指示一次）",
  "Stopped at the time limit": "因超时而停止",
  "Stopped on an error": "因错误而停止",
  "Waiting for your answer": "正在等待回答",
  "Approve one command at a time": "逐条命令批准",
  "Auto": "自动执行",
  "sudo and destructive ones are always approved": "sudo 与破坏性操作必须批准",
  "Plan only": "仅计划",
  "Runs nothing, writes only the steps": "不执行任何操作，只写步骤",
  "Reads run on their own": "读取自动",
  "Reads are asked about too": "读取也要确认",
  "{count} exception|{count} exceptions": "例外 {count}",
  "{count} remembered here": "此服务器的记忆 {count}",
  "sudo allowed": "允许 sudo",
  "Commands that change the server, and any first-time command, stop before running":
    "会改变服务器的命令与首次出现的命令，执行前会停下",
  "No screen (RDP or VNC) is set up for this server.": "此服务器未设置画面（RDP / VNC）。",
  "Nothing to connect to is set.": "未设置连接目标。",
  "Open the connection settings": "打开连接设置",
  "Not one model is registered.": "尚未登记任何模型。",
  "\"{name}\" is not fully set up.": "「{name}」的设置不完整。",
  "Chat": "对话",
  "Runs": "执行记录",
  "What was run on this server (opens in its own window)": "在此服务器执行了什么（在独立窗口打开）",
  "Model and allowlist settings": "模型与许可列表的设置",
  "New chat": "新的对话",
  "This machine has no way to isolate. A command the agent runs here runs with your own privileges, as it is. Every line needs approval.":
    "本机没有隔离机制。Agent 在本机运行的命令，将以你的权限原样执行。每一行都需要批准。",
  "(no goal)": "（无目标）",
  "Show all ({count})": "全部显示（共 {count} 条）",
  "You do not need a server yet. Talking through how to look into something, drafting a skill, adding things up here — all of that works.":
    "还不需要服务器。讨论排查方法、起草技能、在本机汇总，都可以在这里进行。",
  "Write in the box below what you want looked into on this server. Pasting the text of a monitoring alert is fine too.":
    "请在下面的栏中写下希望在这台服务器上排查什么。也可以直接粘贴监控告警的文本。",
  "This one had already been decided.": "此操作已经决定过了。",
  "Command {n}, thinking…": "第 {n} 条命令　正在思考…",
  "Thinking…": "正在思考…",
  "Show the commands it ran": "查看执行过的命令",
  "{title}'s screen": "{title}的画面",
  "Take {title}'s screen away": "移除{title}的画面",
  "The screen as it will be sent": "交付发送时的画面",
  "Send an instruction (e.g. leave that service alone)": "发送指示（例：不要碰那个服务）",
  "Answer the agent's question": "回答 Agent 的提问",
  "Write what you want done (e.g. put together the steps for surveying an Ubuntu box)":
    "写下想委托的事（例：整理调查 Ubuntu 构成的步骤）",
  "Write what to look into (e.g. find out why the disk is filling up)": "写下希望排查什么（例：调查磁盘紧张的原因）",
  "What to add to this conversation": "为此对话添加的内容",
  "Agent": "代理",
  "None (choose below instead)": "不选择（在下面单独选）",
  "Stop": "停止",
  "Start": "开始",
  "Just this once": "仅此一次",
  "Automatic from now on": "今后自动",
  "Refused from now on": "今后禁止",
  "Asked for by {by}": "来自 {by} 的请求",
  "The screen the agent is looking at": "Agent 正在看的画面",
  "Looking up what it does…": "正在查找说明…",
  "Looking up its history on this server…": "正在查找在此服务器的历史…",
  "A first for this server": "这是此服务器上的首次命令",
  "Run {count} time here before|Run {count} times here before": "在此服务器过去执行过 {count} 次",
  "(last on {when})": "（最后一次是 {when}）",
  "⚠ {note} (a machine read this; it can be wrong)": "⚠ {note}（这是机器的判断，可能会读错）",
  "Commands of this kind are always asked about — it cannot be made automatic":
    "此类命令每次都要确认（无法设为自动）",
  "Remember this decision": "记住此判断",
  "Make only \"{program} {verb}\" automatic": "只把「{program} {verb}」设为自动",
  "This particular form cannot be singled out": "无法只针对这种写法指定",
  "While every command is approved, a remembered decision still stops each time. It takes effect in automatic mode":
    "在逐条批准期间，即使记住也每次都会停下。切换到自动模式后才生效",
  "Run it": "执行",
  "Refuse it": "驳回",
  "You can write why in the box below": "驳回的理由可以写在下面的栏中",
  "{count} item|{count} items": "{count} 条",
  "Show the {count} before this": "查看之前的 {count} 条",
  "Close the full text": "关闭全文",
  "Show everything it will write": "查看将要写入的全文",
  "Question": "提问",
  "{bytes} bytes": "{bytes} 字节",
  "Saved to {where}": "已保存到 {where}",
  "Show the remaining {count} lines": "查看剩余 {count} 行",
  "Before": "操作前",
  "After": "操作后",
  "A setting was passed in, so the output was not kept.": "由于传入了配置值，未保存输出。",
  "Rejected": "驳回",
  "Failed": "失败",
  "exit {code}": "退出 {code}",
  "Approved": "批准",
  "Do not think": "不思考",
  "fast, cheap": "快・便宜",
  "Think a little": "略作思考",
  "Normal": "普通",
  "Think well": "认真思考",
  "slow, dear": "慢・贵",
  "Think it right through": "彻底思考",
  "slowest of all": "最慢",
  "No model set": "未设置模型",
  "just now": "刚刚",
  "{minutes} min ago": "{minutes} 分钟前",
  "{hours} h ago": "{hours} 小时前",
  "{days} days ago": "{days} 天前",
  "{weeks} weeks ago": "{weeks} 周前",
  "{months} months ago": "{months} 个月前",

  // RemoteWorkspace.tsx
  "State": "状态",
  "CPU, memory, disk": "CPU・内存・磁盘",
  "Inventory": "构成",
  "Ports, services, cron, Docker, logs": "端口・服务・cron・Docker・日志",
  "Logbook": "台账",
  "Notes, handovers, the facts the agent gets": "备注・交接・交给 Agent 的事实",
  "Files": "文件",
  "To and from the server": "与服务器之间的传输",
  "Records": "记录",
  "The commands run on this server, and what came back": "在此服务器执行的命令及其输出",
  "The key at {where} is not the one recorded. Unless you rebuilt it, do not connect. Recorded {expected} / now {found}":
    "{where} 的密钥与上次不同。若非重建过，请不要连接。上次 {expected} / 本次 {found}",
  "Disconnected": "已断开",
  "This screen is not up yet. Connect first, then record.": "此画面尚未出现。请先连接再录制。",
  "Stopped, because the connection went away.": "因连接断开而停止。",
  "Checking the server's key": "确认服务器密钥",
  "Connecting to {where} for the first time": "首次连接 {where}",
  "This server's key is not known yet. Now is the only moment you can tell whether the other end really is this server.":
    "还不知道此服务器的密钥。只有现在才能确认对方是否真的是这台服务器。",
  "Trust it and connect": "信任并连接",
  "Close the menu": "关闭菜单",
  "Add a server": "添加服务器",
  "Open the menu": "打开菜单",
  "Remote maintenance": "远程维护",
  "Show": "显示",
  "Show or hide the agent's column": "显示或隐藏 Agent 栏",
  "{note} (opens in its own window)": "{note}（在独立窗口打开）",
  "Agent settings": "Agent 的设置",
  "Agent settings (model, commands, skills)": "Agent 的设置（模型・命令・技能）",
  "Run across servers (the same goal on several)": "批量执行（对多台服务器同一目标）",
  "Leave full screen": "退出全屏",
  "Full screen": "全屏",
  "Record": "录制",
  "Recording {clock}": "录制中 {clock}",
  "Disconnect": "断开",
  "Connect": "连接",
  "Which screen to connect with": "用哪个画面连接",
  "Connect with {label}": "用 {label} 连接",
  "Not connected": "未连接",
  "Press Connect and the screen appears here.": "按下「连接」，画面会出现在这里。",
  "Connecting…": "正在连接…",
  "Signing in and building the screen takes the far end a few seconds, sometimes longer.":
    "对方登录并生成画面需要数秒到十几秒。",
  "Hands the agent the session you are looking at (this is what gets sent)":
    "把你正在看的会话画面交给 Agent（发送时的内容）",
  "Handed to the chat": "已交给对话",
  "Hand to the chat": "交给对话",
  "+ Open a session": "＋ 打开会话",
  "Close {title}": "关闭{title}",
  "No session is open.": "没有打开的会话。",
  "A session for typing commands becomes available once SSH is filled in.": "填入 SSH 后即可使用输入命令的会话。",
  "The screen is already set up and usable now. An agent that looks at the screen and works it will run too.":
    "画面已配置好，可以立即使用。看画面并操作的 Agent 也可以运行。",
  "Nothing to connect to has been set.": "尚未设置连接目标。",
  "Fill in a screen (RDP or VNC) or SSH under the connection settings.":
    "请在「连接设置」中填入画面（RDP / VNC）或 SSH 之一。",
  "Width of the chat": "对话的宽度",
  "Server settings": "服务器的设置",
  "No servers yet.": "还没有服务器。",
  "Register the address of a screen (RDP or VNC) or of SSH, and the screen and the session appear — and the agent can work that server.":
    "登记画面（RDP / VNC）或 SSH 的地址后，画面与会话就会出现，Agent 也就能操作那台服务器。",
  "Set up the agent first": "先设置 Agent",
  "Screen + {shell}": "画面+{shell}",

  // ResourceSection.tsx
  "A written procedure for one kind of work. Only the name and the description are always in view; the agent reads the body only when the work is related. It exists so that something like \"how to look at a 502 on this server\" need not be written out every time.":
    "写下某项特定工作做法的操作手册。始终可见的只有名称与说明，Agent 只在相关工作时才读取正文。它的用处是：像「在这台服务器上查看 502 的步骤」这样的内容，不必每次重写。",
  "None yet. If there is a procedure you want the agent to know, write it here.":
    "还没有。如果有想让 Agent 记住的步骤，写在这里。",
  "`skills/<name>/SKILL.md`. The description in the frontmatter is the sentence the agent reads when choosing.":
    "`skills/<名称>/SKILL.md`。frontmatter 中的 description 就是 Agent 选择时读到的句子。",
  "An instruction you use often, under a name. Pick it from the + menu in a conversation and the text lands in the box.":
    "把常用的指示起个名字。从对话的＋菜单中选择后，这里写的文字会进入输入栏。",
  "+ Add a prompt": "＋ 添加提示词",
  "None yet. If you type the same instruction every time, you can name it and keep it here.":
    "还没有。如果每次都在输入同样的指示，可以起名后留在这里。",
  "`prompts/<name>.md`. Picked from the + menu, the body lands in the box — you can edit it before sending.":
    "`prompts/<名称>.md`。从＋菜单选择后，正文会进入输入栏（发送前可以修改）。",
  "Code that steps in at the turning points of a run. It can hook just before a command runs, at the start of a session, and so on. It can also give the agent new tools.":
    "在执行的关键节点介入的代码。可以挂钩在命令执行前、会话开始时等。也可以为 Agent 增加工具。",
  "+ Add an extension": "＋ 添加扩展",
  "None yet. Recording a run, stopping on a condition — that sort of thing is written here.":
    "还没有。记录执行、按条件停止之类的内容写在这里。",
  "`extensions/<name>.ts`. The events you can hook are listed in Pi's docs/extensions.md.":
    "`extensions/<名称>.ts`。可用的事件列在 Pi 的 docs/extensions.md 中。",
  "Name (letters, digits and - _ .)": "名称（英数字与 - _ .）",
  "Create": "生成",
  "Creating…": "生成中…",
  "(no description)": "（无说明）",
  "Let the agent call: {tools}": "让 Agent 可以调用：{tools}",
  "Allow its tools ({tools})": "允许其工具（{tools}）",
  "Open its folder": "打开所在位置",
  "Contents": "内容",
  "Before you install it": "安装之前",
  "Commands it uses:": "使用的命令：",
  "{names} are commands this application does not know, or of a kind it will not run. At run time they go to you, or are refused.":
    "{names} 是本应用不认识的命令，或属于不允许执行的种类。执行时会交给你确认，或被拒绝。",
  "line {line}": "第 {line} 行",
  "This is the result of reading the contents, not something that stops anything running.":
    "这是读取内容后的结果，不是阻止执行的机制。",
  "An extension is": "扩展是",
  "A skill is": "技能是",
  "something its author can also hide things in. What protects you is the allowlist at run time, the approvals and the record.":
    "作者也可以在其中隐藏内容。真正保护你的是执行时的许可列表、批准与记录。",
  "The model is reading it…": "模型正在读取…",
  "Have the model read it too": "也让模型读一遍",
  "Press this and the body of the file is sent to the model you configured.":
    "按下后，此文件的正文会发送给你配置的模型。",
  "What the model made of it": "模型读到的内容",
  "The model says there is nothing worth flagging.": "模型表示没有值得注意的地方。",
  "This is what {by} made of it. It can be wrong.": "这是 {by} 读取的结果。可能会读错。",
  "Anything the author hid does not show up here either.": "作者隐藏的内容，这里同样不会显示。",
  "What you want kept to on every server and every run. Whatever is written here sits in front of the agent at all times. Keep it short, and only write what can be kept.":
    "希望在任何服务器、任何执行中都遵守的内容。这里写的东西会始终放在 Agent 面前。请写得简短，且只写能够遵守的事。",
  "Instructions that always apply": "始终生效的指示",
  "yes": "有",
  "none": "无",
  "e.g.\n- Answer in English\n- Before changing anything, say in one line what will change\n- If a service has to be stopped, say why first":
    "例：\n- 用中文回答\n- 变更之前，用一句话说明要改什么\n- 如果需要停止某个服务，先说明理由",
  "Saved as `AGENTS.md`. Empty it and there are no instructions again.":
    "将保存为 `AGENTS.md`。留空则回到没有指示的状态。",
  "A way of handing out skills, prompts and extensions together. They come from npm or git. Whatever is listed here is prepared by Pi the next time the agent starts.":
    "把技能、提示词、扩展打包分发的机制。从 npm 或 git 安装。这里列出的内容，会在 Agent 下次启动时由 Pi 准备好。",
  "What is installed": "已安装的内容",
  "+ Add a package": "＋ 添加软件包",
  "Add a package": "添加软件包",
  "Where from": "来源",
  "npm:@foo/bar / git:github.com/user/repo / https://… / an absolute path":
    "npm:@foo/bar / git:github.com/user/repo / https://… / 绝对路径",
  "A package runs with this machine's privileges. An extension is code, and a skill can tell the agent to do anything. Read what is in it before installing somebody else's.":
    "软件包以这台工作电脑的权限运行。扩展是代码，技能可以指示 Agent 做任何事。安装别人的东西之前，请先读内容。",
  "Adding…": "添加中…",
  "Nothing installed yet.": "还没有安装。",
  "Only part of it is loaded": "已限定载入的内容",

  // RunsPane.tsx
  "Stopped: too many": "过多而停止",
  "Out of time": "超时",
  "Still asking": "仍在提问",
  "yesterday": "昨天",
  "Command history": "命令历史",
  "Screen recordings": "画面录制",
  "Write a report": "生成报告",
  "No runs recorded yet.": "还没有执行记录。",
  "Choose one on the left.": "请从左侧选择。",
  "Category unknown": "类别不明",
  "Not run": "未执行",
  "Not one command was run.": "没有执行任何命令。",
  "The record ends here.": "记录到此为止。",
  "Work report": "工作报告",
  "Write a work report": "生成工作报告",
  "From": "开始",
  "To": "结束",
  "Choose the dates and press Create, and you get a report you can hand to the customer.":
    "选择期间并按下「生成」，就能得到可交给客户的报告。",
  "Writing it out…": "正在导出…",
  "Only commands containing this text": "仅包含此文字的命令",
  "Show every output": "展开全部输出",
  "Collapse every output": "折叠全部输出",
  "Write out what is showing": "导出当前显示的内容",
  "Write out this list ({count})": "导出此列表（{count} 条）",
  "Excel, spreadsheets": "Excel・电子表格",
  "To paste into a report": "粘贴到报告中",
  "Hand over as it is": "原样交付",
  "To read in another program": "用其他程序读取",
  "No command contains that text.": "没有包含该文字的命令。",
  "None yet. What the agent ran and what you typed in a session both end up here.":
    "还没有。Agent 执行的命令与你在会话中输入的命令都会留在这里。",
  "The output was not kept": "未保留输出",
  "Show the output": "查看输出",
  "Hide the output": "隐藏输出",
  "Copy": "复制",
  "Show this run": "查看此次执行",
  "Put it in a session": "放入会话",
  "Write out": "导出",
  "None yet. Recordings made with Record on the screen end up here.": "还没有。用画面上的「录制」拍摄后，会留在这里。",
  "{width}×{height} · {fps} fps · {parts} parts · {size}":
    "{width}×{height}・{fps} 帧/秒・{parts} 段・{size}",
  " · it ends part-way": "・中途结束",
  "Play": "播放",
  "This recording cannot be played.": "无法播放此录制。",
  "{at} of {total}": "第 {at} / {total} 段",
  "1 part": "1 段",

  // SelectMenu.tsx
  "Filter": "筛选",
  "Nothing found": "找不到",

  // (handed over as data)
  "The reading stopped part way. What is shown here may not be all of it.": "读取中途被截断。此处显示的内容未必是全部。",
  "The open ports could not be read.": "无法读取已开放的端口。",
  "No systemd services — this machine may not use systemd.": "没有 systemd 服务（可能不是 systemd）。",
  "The firewall settings could not be read.": "无法读取防火墙的设置。",
  "It starts processes on this machine": "会在本机启动进程",
  "It reads and writes this machine's files": "会读写本机的文件",
  "It goes out to the network": "会访问网络",
  "It goes out to the network (fetch)": "会访问网络（fetch）",
  "It reads this machine's details": "会读取本机的信息",
  "Declared": "已声明",
  "A command the catalogue does not have, or of a kind that is not run. At run time it goes to you, or is refused":
    "目录中没有的命令，或属于不允许执行的种类。执行时会交给你确认，或被拒绝",
  "It gives the agent this tool": "会为 Agent 增加此工具",
  "This may be somewhere it sends to": "可能是向外发送的目标",
  "Written down as a reference": "作为参考来源写在其中",
  "Everything (journal)": "系统整体 (journal)",

  // kits/index.ts

  // kits/catalog.ts
  "Unfamiliar server": "陌生的服务器",
  "How to work out what a server runs and where it keeps it, without knowing the distribution, the layout, or whether anything was installed by hand.": "在不知道发行版、不知道目录布局、也不知道有没有手工安装过东西的服务器上，弄清它在跑什么、东西放在哪里的方法。",
  "Finding a server's configuration without guessing paths: ask the socket, the binary, the service manager and the package manager, in that order, and search the filesystem last.": "不靠猜路径来弄清服务器配置的方法：依次询问监听、二进制、服务管理器、包管理器，文件搜索放在最后。",
  "Work out what this server runs": "查清这台服务器在跑什么",
  "Sockets, binaries, units and packages — no guessed paths": "从监听、二进制、单元、软件包入手，不猜路径",
  "Work out what this server runs and where its configuration lives. Start from what is listening and what owns those sockets, ask each binary where its own configuration is, and check the service manager and the package manager. Do not assume a distribution layout. Tell me what you could not read and why.": "请查清这台服务器在跑什么、配置放在哪里。先从有什么在监听、这些监听归谁所有开始，再向每个二进制询问它自己的配置在哪，并确认服务管理器和包管理器。不要预设发行版的目录布局。读不到的东西，请连同原因一起告诉我。",
  "Find the logs for what is running": "找出正在运行的服务的日志",
  "Per-unit journals and the files the daemons have open": "按单元的 journal，以及进程当前打开的文件",
  "Find the logs for the services running on this server. Prefer the per-unit journal over hunting for files, and check what the running processes actually have open. Tell me which ones you cannot read.": "请找出这台服务器上正在运行的服务的日志。比起到处找文件，优先用按单元的 journal，并确认正在运行的进程实际打开了哪些文件。读不到的，请告诉我。",
  "Find what was changed from the defaults": "找出被改过的地方",
  "The files somebody edited are the interesting ones": "有人动过的文件，才是值得看的文件",
  "Find which configuration files on this server differ from what their packages shipped, and show me the ones that look deliberate. Anything not owned by a package is worth naming too.": "请找出这台服务器上与软件包原始内容不同的配置文件，并把看起来是有意修改的挑出来给我。不属于任何软件包的东西也请一并列出。",
  "LAMP (WordPress, Apache, MySQL)": "LAMP（WordPress・Apache・MySQL）",
  "When a website is down, slow, or throwing errors: how to work through Apache, MySQL and WordPress.": "网站宕了、变慢、报错的时候，把 Apache、MySQL、WordPress 过一遍。",
  "Investigating Apache, MySQL and WordPress: where the logs are, how to get at 4xx/5xx, and how to look at a slow page and its database.": "Apache＋MySQL＋WordPress 的排查方法：日志在哪、怎么定位 4xx/5xx、慢页面和数据库怎么看。",
  "Look into the 5xx/4xx errors": "排查 5xx/4xx 错误",
  "From the access and error logs: when, which URL, and how many": "从访问日志和错误日志看：什么时候、哪个 URL、出了多少次",
  "Look into the Apache, PHP-FPM and MySQL errors and get a first idea of what is behind the recent 5xx/4xx. Start from whether the services are alive and what the latest log lines say, and if you need counts, copy the large logs across and total them up here. Do not copy out settings or passwords.": "请排查 Apache、PHP-FPM、MySQL 的错误，初步判断最近增多的 5xx/4xx 是什么原因。先看服务是否存活和最近的日志，如果需要统计次数，就把大日志复制到工作区再汇总。不要抄出配置值和密码。",
  "Find out why the site is slow": "找出网站慢的原因",
  "Narrow it down from load, processes and MySQL's state": "从负载、进程和 MySQL 的状态缩小范围",
  "Find out why the site is answering slowly. Start with the load and which of Apache, PHP-FPM and MySQL is eating the machine, then get a first idea of which pages or queries are slow.": "请查清网站响应慢的原因。先看负载，以及 Apache、PHP-FPM、MySQL 中是哪个在吃资源，再初步判断哪些页面或查询慢。",
  "Check that nothing has fallen over": "检查有没有服务挂掉",
  "Apache, MySQL and PHP-FPM: alive, and any recent crash": "确认 Apache、MySQL、PHP-FPM 是否存活，以及最近有没有崩溃",
  "Check whether Apache, MySQL (or MariaDB) and PHP-FPM are alive and whether any of them has crashed or restarted recently, and if something is wrong, get a first idea of why.": "请检查 Apache、MySQL（或 MariaDB）、PHP-FPM 是否存活，以及最近有没有崩溃或重启；如果有异常，请初步判断原因。",
  "Check the WordPress configuration": "确认 WordPress 的配置",
  "wp-config and plugin errors (secrets stay hidden)": "确认 wp-config 和插件引起的错误（机密仍然遮蔽）",
  "Check how WordPress is configured. Look at the settings in wp-config (which database it talks to, debugging, caching) and at the PHP errors from plugins and themes in error.log. You may read passwords and authentication keys, but do not copy them out.": "请确认 WordPress 的构成。看 wp-config 中的设置（连的是哪个数据库、调试、缓存），以及 error.log 里由插件和主题引起的 PHP 错误。密码和认证密钥可以读，但不要抄出来。",
  "Nginx (web server, reverse proxy)": "Nginx（Web・反向代理）",
  "Nginx returning 502/504, a setting that has no effect, an expired certificate — where to look.": "Nginx 返回 502/504、配置不生效、证书过期——这些情况怎么查。",
  "Investigating Nginx: checking the configuration (nginx -t), looking upstream for a 502/504, the access and error logs, and certificate expiry.": "Nginx 的排查方法：配置检查（nginx -t）、502/504 时怎么看上游、访问/错误日志、证书有效期。",
  "Look into the 502/504": "排查 502/504",
  "Narrow it down from error.log and whether the upstream is alive": "从 error.log 和上游是否存活来缩小范围",
  "Look into why Nginx is returning 502/504. Read the upstream lines in error.log and get a first idea of whether the PHP-FPM or application behind it is down or timing out.": "请查清 Nginx 返回 502/504 的原因。看 error.log 中 upstream 的行，初步判断后面的 PHP-FPM 或应用是不是挂了、或者超时了。",
  "Check the configuration": "确认配置",
  "nginx -t, and what is actually in effect": "nginx -t，以及实际生效的配置",
  "Check the Nginx configuration. Start with nginx -t for validity, then work out which server and location the Host and path in question actually match.": "请确认 Nginx 的配置。先用 nginx -t 看是否有效，再确认出问题的 Host 和路径实际命中了哪个 server/location。",
  "Check when the certificate expires": "确认证书的有效期",
  "TLS expiry, the chain, and whether the name matches": "看 TLS 证书的有效期、证书链、域名是否匹配",
  "Check when the TLS certificate this Nginx uses expires, and whether there is anything wrong with its chain or with the name it is issued for.": "请确认这个 Nginx 使用的 TLS 证书的有效期，以及证书链和域名是否有问题。",
  "Total up the access log": "汇总访问日志",
  "Counts by status and by URL, to see what stands out": "按状态码和 URL 统计次数，看有没有异常",
  "From the Nginx access log, get the shape of the traffic by status and by URL, and find anything that stands out. Copy large logs across and total them up here.": "请从 Nginx 的访问日志中，按状态码和 URL 掌握次数的趋势，看有没有异常。大日志请复制到工作区再汇总。",
  "Docker (containers, Compose)": "Docker（容器・Compose）",
  "A container that dies, restarts in a loop, or eats the disk — where to look in a container setup.": "容器挂掉、反复重启、吃掉磁盘——容器环境怎么查。",
  "Investigating Docker and Compose: whether containers are alive and restarting, following their logs, resources and disk, and reading a Compose setup.": "Docker/Compose 的排查方法：容器是否存活与重启、怎么追日志、资源与磁盘、Compose 的构成。",
  "Look into a container that keeps dying": "排查反复挂掉的容器",
  "Exit code, restart count and logs — including OOM": "从退出码、重启次数、日志缩小范围（也看 OOM）",
  "Look into the containers that are dying or restarting in a loop. Use docker ps -a and docker inspect for the exit code, RestartCount and OOMKilled, and get a first idea of the cause from the logs.": "请排查那些挂掉或反复重启的容器。用 docker ps -a 和 docker inspect 看退出码、RestartCount、OOMKilled，再从日志初步判断原因。",
  "List the state of the containers": "列出容器的状态",
  "Which are alive, and what they are using": "哪些还活着，以及它们各自吃了多少",
  "List which containers are running and which are stopped, and summarise the state of each and what it is using (CPU, memory).": "请列出正在运行和已停止的容器，并汇总各自的状态与资源消耗（CPU、内存）。",
  "Find what is eating the disk": "找出吃掉磁盘的东西",
  "The breakdown across images, containers and volumes": "列出镜像、容器、卷各自占用的容量",
  "Find out what is making Docker eat the disk. Break it down with docker system df -v and show me what is using the space. Do not delete anything.": "请查清 Docker 吃掉磁盘的原因。用 docker system df -v 列出明细，指出是什么在占用容量。不要执行删除操作。",
  "Check the Compose setup": "确认 Compose 的构成",
  "Services, ports and dependencies from the compose file (secrets stay hidden)": "从 compose 文件读服务、端口、依赖（机密仍然遮蔽）",
  "Check the Docker Compose setup on this machine. Read the services, ports and dependencies from the compose file. Do not copy out environment values or passwords.": "请确认这台机器上 Docker Compose 的构成。从 compose 文件读出服务、端口和依赖关系。不要抄出环境变量和密码。",
  "PostgreSQL": "PostgreSQL",
  "Cannot connect, slow, or eating the disk — where to look in PostgreSQL.": "连不上、变慢、吃磁盘——PostgreSQL 怎么查。",
  "Investigating PostgreSQL: whether it is alive and reachable, slow queries and waits, connection counts, disk and logs.": "PostgreSQL 的排查方法：是否存活与能否连接、慢查询与等待、连接数、磁盘与日志。",
  "Find out why it will not connect": "查清连不上的原因",
  "The service, the port, pg_hba and the connection limit": "从服务、端口、pg_hba、连接数上限缩小范围",
  "Find out why PostgreSQL will not accept a connection. Look at whether the service is alive and on its port, at the authentication in pg_hba.conf, and at the connection limit. Ask me for the password.": "请查清 PostgreSQL 无法接受连接的原因。看服务是否存活、是否在监听端口、pg_hba.conf 的认证，以及连接数上限。密码请向操作者确认。",
  "Look into slow queries and waits": "排查慢查询和等待",
  "The heavy and waiting queries in pg_stat_activity": "从 pg_stat_activity 看重的和正在等待的查询",
  "Find out why PostgreSQL is slow. Use pg_stat_activity for long-running queries, waits and locks, and narrow down where the slowness comes from.": "请查清 PostgreSQL 慢的原因。用 pg_stat_activity 看长时间运行的查询、等待和锁，缩小慢的来源。",
  "Check the connection count": "确认连接数",
  "Connections by state, and idle in transaction": "按状态看连接数，以及 idle in transaction",
  "Check PostgreSQL's connections by state and tell me whether anything is wrong — idle in transaction piling up, for instance.": "请按状态确认 PostgreSQL 的连接数，看有没有异常，比如 idle in transaction 是不是堆积了。",
  "Look into the disk usage": "排查磁盘占用",
  "Size per database, and whether WAL is piling up": "确认各数据库的大小，以及 WAL 是否堆积",
  "Find out how much disk PostgreSQL is using. Check the size of each database, whether WAL is piling up, and how much room is left on the host.": "请查清 PostgreSQL 用了多少磁盘。确认各数据库的大小、WAL 有没有堆积，以及主机还剩多少空间。",

  // pi.ts, files/session.ts, windows.ts, agent/secrets.ts
  "Pi does not know a service called {name}.": "Pi 不认识名为 {name} 的服务。",
  "That skill cannot be read.": "读不了这个技能。",
  "The agent's runtime (Pi) could not be loaded: {detail}": "无法载入 Agent 的运行基座（Pi）：{detail}",
  "{model} from {provider} could not be used. In the agent settings, sign in to that service or enter an API key for it.": "无法使用 {provider} 的 {model}。请在 Agent 设置的模型里登录该服务，或填入 API 密钥。",
  "Pi could not resolve the model “{name}”.": "Pi 无法解析模型「{name}」。",
  "({count} value that looked like a secret was hidden. The value itself went neither to the model nor into the record — open a session if you need to see it.)|({count} values that looked like secrets were hidden. The values themselves went neither to the model nor into the record — open a session if you need to see them.)": "（遮蔽了 {count} 处看起来像机密的值。真正的值既没有交给模型，也没有写入记录。需要的话请在会话里确认。）",
  "{path} cannot be opened: {reason}": "打不开 {path}：{reason}",
  "the home directory": "主目录",
  "{path} cannot be read: {reason}": "读不了 {path}：{reason}",
  "SFTP is switched off on this server (the sshd Subsystem sftp line). SSH itself is working.": "这台服务器上 SFTP 被关闭了（sshd 的 Subsystem sftp）。SSH 本身是通的。",
  "SFTP will not open: {reason}": "打不开 SFTP：{reason}",
  "Task Scheduler": "任务计划程序",
  "Windows Defender Firewall": "Windows Defender 防火墙",
  "{profile}: {state} (inbound defaults to {inbound})": "{profile}：{state}（入站默认 {inbound}）",

  // agent/resources.ts, agent/riskHint.ts
  "A name may use letters, digits and - _ . only, up to 63 characters (Pi looks for the file under this name).": "名称只能用英数字和 - _ .，最多 63 个字符（Pi 会按这个名称找文件）。",
  "When to use it and what it does. The agent reads this line to choose.": "什么时候用、做什么。Agent 会读这一行来选择。",
  "Steps": "步骤",
  "What this prompt does": "这个提示做什么",
  "Name here the tools this extension registers, separated by spaces.": "在这里写下这个扩展要注册的道具名称（用空格分隔）。",
  "For example: // @tools recall remember": "例如： // @tools recall remember",
  "Only the names written here reach the agent, and only once the settings allow them.": "只有写在这里的名称，并且在设置中允许之后，才会交给 Agent。",
  "Steps in at the points of a run. The events you can use are in Pi's docs/extensions.md.": "在运行的关键节点介入。可用的事件见 Pi 的 docs/extensions.md。",
  "For example: keep a record, or stop the run when something holds": "例如：留下记录，或在某些条件下停止",
  "To reach an outside service, register a tool here.": "要连接外部服务的话，在这里注册道具。",
  "Write it as npm:name, git:host/user/repository, https://… or an absolute path.": "请写成 npm:名称 / git:主机/用户/仓库 / https://… / 绝对路径 之一。",
  "This may be able to do more than read.": "可能不只是读取。",

  // RemoteAgentChat.tsx

  // agent/session.ts, RemoteAgentChat.tsx

  // AgentSettingsForm.tsx, RunsPane.tsx (the trace)
  "What is kept of each run":
    "每次执行要保留的内容",
  "Keep the whole conversation with the model":
    "保留与模型的全部往来",
  "Everything sent to the model and everything it said, run by run, beside the run's record on this machine. Nothing is sent anywhere for it. Open a run under \"Runs\" to write one out. A long run is a few hundred kilobytes; a very long one, a few megabytes.":
    "把发给模型的内容和模型返回的内容，按每次执行保存在执行记录旁边。不会为此向外发送任何东西。要导出时，请在「执行记录」中打开某次执行。较长的执行约几百 KB，非常长的也就几 MB。",
  "What the model saw":
    "模型看到的内容",
  "Everything sent to the model and everything it said, this run":
    "本次执行发给模型的内容和模型返回的内容的全部",
  "Write it out ({size})":
    "导出（{size}）",
  "The prompt and every turn, to read":
    "提示与每次往来，供阅读",
  "Every event as it arrived":
    "原样保留每个事件",
  "The report was written.": "已写好报告。",
  "Write the report": "生成报告",
  "It has not been read yet: connect to this server, or press Read again.":
    "还没有读取到。请连接这台服务器，或按「重新读取」。",

  // PluginsSection.tsx, plugins/index.ts
  "There is no plugin called {id}.":
    "没有这个插件：{id}",
  "Plugins":
    "插件",
  "Plugins available":
    "可用的插件",
  "No plugins.":
    "没有插件。",
  "Installed, the knowledge above is always in the agent's view — the bodies are read only when needed. Removed, only what this plugin installed is deleted; anything you wrote yourself stays.":
    "装上后，上面的知识会一直在 Agent 的视野里（正文只在需要时读取）。卸载时只删除这个插件装的东西，你自己写的会保留。",
  "Plugins ship inside this application. Installing or removing one sends nothing over the network. What a plugin installed can also be seen under Skills.":
    "插件随本应用一同发布。装上或卸载都不会向外发送任何东西。插件装入的内容也可以在「技能」里看到。",
  "Nothing to put in here yet. A plugin brings investigations you can start with one press, and a sub-agent or a prompt appears here once you make one.":
    "这里还没有可放的东西。装上插件后，这里会列出一按即可开始的调查。创建了 Agent 或提示后，也会出现在这里。",
  "Look at the plugins":
    "查看插件",
  "\"{name}\" looks like a fit for this server. Install it and the usual investigations are one click away.":
    "「{name}」看起来适合这台服务器。装上后，常见的调查一按即可。",
  "What to ask for when this is picked from the ＋ menu. Leave it out and it is knowledge only.":
    "从 ＋ 菜单选中时要提出的请求。不写的话，就只作为知识使用。",
  "The skills it installs": "会装入的技能",
  "in the ＋ menu": "会出现在 ＋ 菜单",
  "`skills/<name>/SKILL.md`. The description in the frontmatter is the sentence the agent reads when choosing; add a `goal:` and the skill also appears in a conversation's ＋ menu, putting that line in the box.":
    "`skills/<名称>/SKILL.md`。frontmatter 中的 description 是 Agent 选择时读的那句话。加上 `goal:`，这个技能还会出现在对话的 ＋ 菜单里，把那句话放进输入框。",

  // plugins (adding one), resources (importing a skill)
  "This folder has no plugin.json.":
    "这个文件夹里没有 plugin.json。",
  "A plugin that ships with the application is already called {id}.":
    "内置插件里已经有叫 {id} 的了。",
  "This folder has no skills directory.":
    "这个文件夹里没有 skills 目录。",
  "There is not one skill in this folder.":
    "这个文件夹里一个技能都没有。",
  "A plugin may hold up to {count} skills.":
    "一个插件最多放 {count} 个技能。",
  "{name} has no SKILL.md.":
    "{name} 里没有 SKILL.md。",
  "{name} is too large to read as a skill.":
    "{name} 太大了，无法作为技能读取。",
  "A plugin that ships with the application cannot be forgotten.":
    "内置插件无法被移出列表。",
  "Choose the folder that holds plugin.json":
    "请选择含有 plugin.json 的文件夹",
  "There is no SKILL.md in that folder.":
    "那个文件夹里没有 SKILL.md。",
  "Choose a SKILL.md, or the folder that holds one":
    "请选择 SKILL.md，或含有它的文件夹",
  "Reading…":
    "读取中…",
  "Add a plugin":
    "添加插件",
  "Nothing is installed by adding it: the skills are written when you press Install. Read them first — a skill is text the agent will act on.":
    "只是添加还不会装入任何东西，技能是在按下「安装」时才写入的。请先读一读内容——技能是 Agent 会照着做的文字。",
  "+ From a file":
    "＋ 从文件添加",
  "+ From a folder": "＋ 从文件夹",
  "+ Write a new one": "＋ 新写一个",
  "Show or hide the screen": "显示或隐藏画面",
  "Show or hide the session": "显示或隐藏会话",
  "{count} note|{count} notes": "已知 {count} 条",
  "Written down in the logbook: {title}": "已写入台账：{title}",

  // KartePane.tsx (what earlier runs established)
  "What is known about this server":
    "关于这台服务器已知的内容",
  "What earlier runs established":
    "以往查明的内容",
  "Nothing yet. As an investigation works something out, it writes it here — and the next run is handed it instead of finding it again.":
    "还没有内容。调查弄清什么之后，Agent 会写在这里。下次执行会拿到它，不必再查一遍。",
  "Correct it":
    "修改",
  "The next run is handed what you save here.":
    "在这里保存的内容会交给下次执行。",
  "{count} of {most} kept. Past that, the oldest goes.":
    "最多保留 {most} 条（当前 {count} 条）。超过后从最旧的开始丢弃。",
  "Save as a file":
    "保存为文件",
  "The conversation was getting long, so what came before was summarised. What was written down in the logbook is kept in full.":
    "对话变长了，之前的部分已被总结。写入台账的内容原样保留。",
  "Start a new conversation to change the model.":
    "要更换模型，请开始新的对话。",
  "Start a new conversation to change this.":
    "要更改，请开始新的对话。",

  // RemoteWorkspace.tsx (the clipboard)
  "Clipboard":
    "剪贴板",
  "What copy and paste has to work with on this server":
    "在这台服务器上复制粘贴的状态",
  "On this machine":
    "这台机器上的内容",
  "Nothing is copied.":
    "没有复制任何内容。",
  "To this server":
    "发往这台服务器",
  "The clipboard channel is not open.":
    "剪贴板通道没有打开。",
  "Offered, and the server took it at {when}.":
    "已提供，服务器在 {when} 取走了。",
  "Offered at {when}. The server has not come for it — paste over there to pull it.":
    "已在 {when} 提供。服务器还没有来取（在那边粘贴时才会来取）。",
  "Nothing has been offered yet.":
    "还没有提供任何内容。",
  "From this server":
    "来自这台服务器的内容",
  "Offer it again":
    "再发送一次",
  "Type it in":
    "作为文字键入",
  "Type it in — it goes where the cursor is":
    "键入（会进入光标所在处）",
  "Typing stops at 2000 characters.":
    "键入最多 2000 个字符。",
};
