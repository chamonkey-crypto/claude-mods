# claude-mods

自己用的 Claude Code mod。

## usage-band

輸入框上方的一行細帶，顯示 context 用量、五小時額度用量與重置時間（台灣時間）、本週額度用量；超過 80% 的項目變紅。每一輪結束更新一次。

## 安裝（每台電腦一次）

GitHub 上是私人 repository，命令列的 git 權限讀不到，所以用 Fork 把 repository 抓到本機，再讓 Claude Code 讀那個資料夾。

1. 用 Fork 把 `chamonkey-crypto/claude-mods` clone 到本機（家裡放在 `D:\@Development\claude-mods`，公司可以放別的位置）。
2. 在終端機執行（路徑換成 clone 的位置）：

```bash
claude plugin marketplace add "D:/@Development/claude-mods"
claude plugin install usage-band@claude-mods --scope user
```

3. 開新的工作階段，輸入框上方就會出現細帶（桌面 app 和終端機都有）。

## 更新

1. 用 Fork 在 claude-mods 按 Pull。
2. 開新的工作階段（終端機的工作階段也可以輸入 `/reload-plugins`）。

Claude Code 直接讀這個資料夾，不用重新安裝。
