# claude-mods

自己用的 Claude Code mod。

## hourglass（沙漏）

輸入框上方的圓角框：context、五小時額度（含還剩多久重置）、本週額度各一條進度條，右側是提示快取的到期倒數。用量超過 70% 變黃、90% 變紅；快取剩不到 5 分鐘變黃、不到 1 分鐘變紅，過了顯示「已過期」。

快取倒數是推算的：Claude Code 沒有直接給 mod 快取的到期時間，所以用「最後一次有讀寫快取的回應時間」加上存活時間來估。一輪進行中顯示「快取 ⋯」，結束後才重新倒數。存活時間預設 1 小時；用 API 金鑰的話，到 `/config` 把「快取存活時間」改成 5 分鐘。額度欄只有 Pro、Max 訂閱才有，沒有的話顯示「—」。

**工作進度條**：Claude 開始做事時，圓角框下面會多一行進度條，顯示這一輪已經做了多久，並用最近 5 輪的平均時間推算「預估還約幾分幾秒」；超過平均會變黃。做完且這一輪超過 10 秒，會透過終端機的通知（響鈴或系統通知，看你的 Claude Code 通知設定）叮一聲；太短的回覆不叮。沒有歷史紀錄時只顯示經過時間。這些都是在本機算的，不會呼叫模型，不花 token、不產生費用。

## handoff（交接鈕）

context 用到 70% 時，沙漏的 context 旁邊會冒出「交接」按鈕（也可以按 `h`）。按下去會跑該專案的交接流程，依序找：

1. 有沒有 `/handoff` 或 `/交接` 之類的指令（專案、外掛或 skill 都算），有就直接執行。
2. 專案資料夾有沒有交接文件（`HANDOFF.md`、`handoff.md`、`交接.md`，或放在 `docs/`、`.claude/` 底下），有就請 Claude 照文件做。
3. 都沒有，就請 Claude 照 `CLAUDE.md` 或專案慣例整理進度、決策、待辦和下一步；專案沒定義的話會先回報，不亂建。

出現門檻預設 70%，可在 `/config` 改成 60 或 80。

要搭配沙漏用：交接鈕是接在沙漏那條橫幅上。外掛列在前面的在外層，所以交接鈕要排在沙漏前面：**先裝交接鈕、再裝沙漏**（`~/.claude/settings.json` 的 `enabledPlugins` 裡 `handoff` 要寫在 `hourglass` 上面）。順序反了，按鈕會被沙漏蓋住，永遠不出現。

## edit-radar（撞檔雷達）

同時開好幾個對話時，避免兩個對話改到同一個檔案。

- 每次 Claude 用 Write、Edit、NotebookEdit 改完檔案，就把檔名、時間和這個對話的 ID 記在所有對話共用的資料夾（`~/.claude/edit-radar/`，一個對話一個檔案，各寫各的，不會互相蓋掉）。
- 每次要改檔案之前，先查過去 30 分鐘有沒有別的對話改過同一個檔案。有的話跳出問題：哪個對話（ID 前 8 碼和它的工作資料夾）、幾分鐘前改的，問你要「繼續」還是「取消」。
- 選「取消」或把問題關掉，這次就不改，Claude 會停下來等你指示；在「Other」打字的話，你打的話會轉給 Claude。
- 選「繼續」之後，同一個檔案不會一直問；要等那個對話又改了一次才會再問。
- 紀錄只留最近 30 分鐘：自己的舊紀錄每次寫入時刪掉；別的對話 30 分鐘沒動的紀錄，在開新對話時清空。
- 路徑的大小寫和 `\`、`/` 寫法不同也算同一個檔案。

限制：Claude 用 Bash 指令（例如 `sed`、`git checkout`、`npm install`）改到的檔案不會被記錄，也不會被擋。雷達本身出錯時（例如資料夾讀不到）會放行，不會卡住改檔。

## 安裝（每台電腦一次）

GitHub 上是私人 repository，命令列的 git 權限讀不到，所以用 Fork 把 repository 抓到本機，再讓 Claude Code 讀那個資料夾。

1. 用 Fork 把 `chamonkey-crypto/claude-mods` clone 到本機（家裡放在 `D:\@Development\claude-mods`，公司可以放別的位置）。
2. 在終端機執行（路徑換成 clone 的位置）：

```bash
claude plugin marketplace add "D:/@Development/claude-mods"
claude plugin install handoff@claude-mods --scope user
claude plugin install hourglass@claude-mods --scope user
claude plugin install edit-radar@claude-mods --scope user
```

3. 開新的工作階段，輸入框上方就會出現橫幅（桌面 app 和終端機都有）。

## 更新

1. 用 Fork 在 claude-mods 按 Pull。
2. 開新的工作階段（終端機的工作階段也可以輸入 `/reload-plugins`）。

Claude Code 直接讀這個資料夾，已經裝好的 mod 不用重新安裝。新加的 mod（例如沙漏）要先 `claude plugin marketplace update claude-mods`，再 `claude plugin install <名稱>@claude-mods --scope user`。
