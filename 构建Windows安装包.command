#!/bin/zsh
cd "${0:A:h}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "课堂积分 0.3.2 · 正在构建 Windows x64 安装包"
echo "首次构建约 3-8 分钟，请保持网络畅通，不要关闭窗口。"
echo ""
npm run build:win
echo ""
if [ -f "dist/课堂积分 Setup 0.3.2.exe" ]; then
  echo "构建完成：dist/课堂积分 Setup 0.3.2.exe"
  open dist
else
  echo "构建未成功完成，请查看上方错误信息。"
fi
echo "按任意键关闭…"
read -k 1
