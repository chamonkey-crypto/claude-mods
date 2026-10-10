# claude-mods

自己用的 Claude Code mod。

## usage-band

輸入框上方的一行細帶，顯示 context 用量、五小時額度用量與重置時間（台灣時間）、本週額度用量；超過 80% 的項目變紅。每一輪結束更新一次。

## hourglass（沙漏）

輸入框上方的圓角框：context、五小時額度（含還剩多久重置）、本週額度各一條進度條，右側是提示快取的到期倒數。用量超過 70% 變黃、90% 變紅；快取剩不到 5 分鐘變黃、不到 1 分鐘變紅，過了顯示「已過期」。

用來取代 usage-band，兩個不要同時裝，不然輸入框上方會有兩條。

快取倒數是推算的：Claude Code 沒有直接給 mod 快取的到期時間，所以用「最後一次有讀寫快取的回應時間」加上存活時間來估。一輪進行中顯示「快取 ⋯」，結束後才重新倒數。存活時間預設 1 小時；用 API 金鑰的話，到 `/config` 把「快取存活時間」改成 5 分鐘。額度欄只有 Pro、Max 訂閱才有，沒有的話顯示「—」。

## handoff（交接鈕）

context 用到 70% 時，沙漏的 context 旁邊會冒出「交接」按鈕（也可以按 `h`）。按下去會跑該專案的交接流程，依序找：

1. 有沒有 `/handoff` 或 `/交接` 之類的指令（專案、外掛或 skill 都算），有就直接執行。
2. 專案資料夾有沒有交接文件（`HANDOFF.md`、`handoff.md`、`交接.md`，或放在 `docs/`、`.claude/` 底下），有就請 Claude 照文件做。
3. 都沒有，就請 Claude 照 `CLAUDE.md` 或專案慣例整理進度、決策、待辦和下一步；專案沒定義的話會先回報，不亂建。

出現門檻預設 70%，可在 `/config` 改成 60 或 80。

要搭配沙漏用：交接鈕是接在沙漏那條橫幅上。兩個都裝的話，**先裝沙漏、再裝交接鈕**；如果按鈕沒出現，把交接鈕解除安裝再重裝一次。

## 安裝（每台電腦一次）

GitHub 上是私人 repository，命令列的 git 權限讀不到，所以用 Fork 把 repository 抓到本機，再讓 Claude Code 讀那個資料夾。

1. 用 Fork 把 `chamonkey-crypto/claude-mods` clone 到本機（家裡放在 `D:\@Development\claude-mods`，公司可以放別的位置）。
2. 在終端機執行（路徑換成 clone 的位置）：

```bash
claude plugin marketplace add "D:/@Development/claude-mods"
claude plugin install hourglass@claude-mods --scope user
claude plugin install handoff@claude-mods --scope user
```

之前裝過 usage-band 的，換成沙漏要多一步：

```bash
claude plugin uninstall usage-band@claude-mods --scope user
```

3. 開新的工作階段，輸入框上方就會出現橫幅（桌面 app 和終端機都有）。

## 更新

1. 用 Fork 在 claude-mods 按 Pull。
2. 開新的工作階段（終端機的工作階段也可以輸入 `/reload-plugins`）。

Claude Code 直接讀這個資料夾，已經裝好的 mod 不用重新安裝。新加的 mod（例如沙漏）要先 `claude plugin marketplace update claude-mods`，再 `claude plugin install <名稱>@claude-mods --scope user`。
