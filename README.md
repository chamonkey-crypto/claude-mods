# claude-mods

自己用的 Claude Code mod。

## usage-band

輸入框上方的一行細帶，顯示 context 用量、五小時額度用量與重置時間（台灣時間）、本週額度用量；超過 80% 的項目變紅。每一輪結束更新一次。

## 安裝（每台電腦一次，在終端機執行）

```bash
claude plugin marketplace add chamonkey-crypto/claude-mods
claude plugin install usage-band@claude-mods --scope user
```

## 更新

```bash
claude plugin update usage-band@claude-mods
```

更新後重開工作階段（或在終端機的工作階段輸入 `/reload-plugins`）。
