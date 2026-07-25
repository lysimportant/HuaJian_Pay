param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\docs\assets\server-deploy')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$fontName = 'Microsoft YaHei UI'
$navy = [System.Drawing.ColorTranslator]::FromHtml('#102A43')
$blue = [System.Drawing.ColorTranslator]::FromHtml('#1677FF')
$lightBlue = [System.Drawing.ColorTranslator]::FromHtml('#EAF3FF')
$cyan = [System.Drawing.ColorTranslator]::FromHtml('#E8FAFF')
$green = [System.Drawing.ColorTranslator]::FromHtml('#13A46B')
$lightGreen = [System.Drawing.ColorTranslator]::FromHtml('#E9F9F2')
$orange = [System.Drawing.ColorTranslator]::FromHtml('#FA8C16')
$lightOrange = [System.Drawing.ColorTranslator]::FromHtml('#FFF3E6')
$gray = [System.Drawing.ColorTranslator]::FromHtml('#60758A')
$line = [System.Drawing.ColorTranslator]::FromHtml('#C9D7E5')
$bg = [System.Drawing.ColorTranslator]::FromHtml('#F6F9FC')
$white = [System.Drawing.Color]::White

function New-Board([int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $graphics.Clear($bg)
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function New-RoundPath([System.Drawing.RectangleF]$rect, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-Card($g, [float]$x, [float]$y, [float]$w, [float]$h, $fill, $border = $line, [float]$radius = 24) {
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $path = New-RoundPath $rect $radius
  $brush = New-Object System.Drawing.SolidBrush($fill)
  $pen = New-Object System.Drawing.Pen($border, 3)
  $g.FillPath($brush, $path)
  $g.DrawPath($pen, $path)
  $brush.Dispose(); $pen.Dispose(); $path.Dispose()
}

function Draw-Text($g, [string]$text, [float]$x, [float]$y, [float]$w, [float]$h, [float]$size, $color = $navy, [bool]$bold = $false, [string]$align = 'Center') {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  $font = New-Object System.Drawing.Font($fontName, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush($color)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::$align
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit
  $g.DrawString($text, $font, $brush, (New-Object System.Drawing.RectangleF($x, $y, $w, $h)), $format)
  $format.Dispose(); $brush.Dispose(); $font.Dispose()
}

function Draw-Arrow($g, [float]$x1, [float]$y1, [float]$x2, [float]$y2, $color = $blue, [float]$width = 7) {
  $pen = New-Object System.Drawing.Pen($color, $width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::ArrowAnchor
  $g.DrawLine($pen, $x1, $y1, $x2, $y2)
  $pen.Dispose()
}

function Draw-Title($g, [string]$title, [string]$subtitle, [float]$width) {
  Draw-Text $g $title 90 45 ($width - 180) 90 52 $navy $true 'Near'
  Draw-Text $g $subtitle 90 130 ($width - 180) 60 28 $gray $false 'Near'
  $pen = New-Object System.Drawing.Pen($blue, 8)
  $g.DrawLine($pen, 90, 205, 360, 205)
  $pen.Dispose()
}

function Save-Board($board, [string]$name) {
  $path = Join-Path $OutputDir $name
  $board.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $board.Graphics.Dispose(); $board.Bitmap.Dispose()
  Write-Host "generated $path"
}

# 01 architecture
$b = New-Board 2400 1220; $g = $b.Graphics
Draw-Title $g '生产架构：域名 HTTPS + Nginx + Docker API + Admin 静态站' '你已有服务器和域名时，按此结构部署最稳' 2400
$cards = @(
  @{x=90; title='用户 / newapi / 支付宝'; body="浏览器访问 Admin`n支付下单与异步回调"; fill=$cyan},
  @{x=660; title='域名 + HTTPS'; body="pay.example.com`n证书终止于 Nginx"; fill=$lightBlue},
  @{x=1230; title='Nginx'; body="静态托管 Admin`n反代 /admin/api 与支付路径"; fill=$lightOrange},
  @{x=1800; title='Docker API + SQLite'; body="huajian-server:8080`n数据卷 /data/*.db"; fill=$lightGreen}
)
foreach ($c in $cards) {
  Draw-Card $g $c.x 300 500 280 $c.fill
  Draw-Text $g $c.title ($c.x + 24) 330 452 80 36 $navy $true
  Draw-Text $g $c.body ($c.x + 24) 420 452 130 28 $gray
}
Draw-Arrow $g 590 440 650 440
Draw-Arrow $g 1160 440 1220 440
Draw-Arrow $g 1730 440 1790 440
Draw-Card $g 300 700 1800 360 $white $line 28
Draw-Text $g '关键路径' 360 730 360 70 36 $blue $true 'Near'
Draw-Text $g '1  / 与 Admin 静态资源 → Nginx 本地 dist' 390 820 1600 50 29 $navy $false 'Near'
Draw-Text $g '2  /admin/api/*  /submit.php  /channels/*  /pay/*  /health → 127.0.0.1:8080' 390 890 1650 50 29 $navy $false 'Near'
Draw-Text $g '3  支付宝回调：https://你的域名/channels/alipay/notify' 390 960 1600 50 29 $navy $false 'Near'
Save-Board $b '01-architecture.png'

# 02 steps
$b = New-Board 2400 1180; $g = $b.Graphics
Draw-Title $g '已有服务器和域名时的 6 步部署' 'Docker Compose 起 API，Nginx 管 HTTPS 与 Admin' 2400
$steps = @(
  @{n='1'; title='准备环境'; body="Docker / Compose`nNginx / 证书工具"; x=90},
  @{n='2'; title='拉代码'; body="git clone`n进入项目目录"; x=570},
  @{n='3'; title='写生产 .env'; body="域名 / 强密钥`n支付宝材料"; x=1050},
  @{n='4'; title='启动 API'; body="compose up -d`n健康检查 ok"; x=1530},
  @{n='5'; title='Admin + HTTPS'; body="构建 dist`nNginx 反代"; x=2010}
)
foreach ($s in $steps) {
  Draw-Card $g $s.x 350 390 340 $lightBlue
  Draw-Card $g ($s.x+135) 290 120 120 $blue $blue 60
  Draw-Text $g $s.n ($s.x+135) 292 120 112 50 $white $true
  Draw-Text $g $s.title ($s.x+25) 440 340 70 34 $navy $true
  Draw-Text $g $s.body ($s.x+25) 525 340 120 27 $gray
  if ($s.n -ne '5') { Draw-Arrow $g ($s.x+395) 520 ($s.x+470) 520 $blue 6 }
}
Draw-Card $g 300 820 1800 200 $navy $navy 24
Draw-Text $g '第 6 步验收' 350 850 320 120 34 $white $true 'Near'
Draw-Text $g 'health=ok  ·  Admin 可登录  ·  支付宝回调可达  ·  小额真实支付成功  ·  订单置 paid' 680 850 1350 120 28 $white $false 'Near'
Save-Board $b '02-deploy-steps.png'

# 03 nginx map
$b = New-Board 2400 1360; $g = $b.Graphics
Draw-Title $g 'Nginx 路径映射（生产最关键）' '8080 仅本机监听，不直接暴露公网' 2400
$rows = @(
  @('https://域名/','Admin 静态站','apps/admin/dist'),
  @('/admin/api/*','反代 API','127.0.0.1:8080'),
  @('/submit.php /mapi.php /api.php','易支付入口','127.0.0.1:8080'),
  @('/channels/*','支付宝/微信回调','127.0.0.1:8080'),
  @('/pay/*','用户支付页','127.0.0.1:8080'),
  @('/health','健康检查','127.0.0.1:8080')
)
Draw-Card $g 120 270 680 100 $lightOrange; Draw-Text $g '浏览器路径' 120 275 680 90 34 $navy $true
Draw-Card $g 860 270 680 100 $lightBlue; Draw-Text $g 'Nginx 动作' 860 275 680 90 34 $navy $true
Draw-Card $g 1600 270 680 100 $lightGreen; Draw-Text $g '后端目标' 1600 275 680 90 34 $navy $true
for ($i=0; $i -lt $rows.Count; $i++) {
  $y = 410 + $i * 135
  $fill = if ($i % 2 -eq 0) { $white } else { [System.Drawing.ColorTranslator]::FromHtml('#F0F5FA') }
  Draw-Card $g 120 $y 680 105 $fill $line 16
  Draw-Card $g 860 $y 680 105 $fill $line 16
  Draw-Card $g 1600 $y 680 105 $fill $line 16
  Draw-Text $g $rows[$i][0] 145 ($y+10) 630 85 28 $navy $false
  Draw-Text $g $rows[$i][1] 885 ($y+10) 630 85 28 $blue $true
  Draw-Text $g $rows[$i][2] 1625 ($y+10) 630 85 28 $navy $false
}
Save-Board $b '03-nginx-map.png'

# 04 checklist
$b = New-Board 2400 1220; $g = $b.Graphics
Draw-Title $g '上线验收清单' '全部打勾后再把 newapi 切到正式域名' 2400
$items = @(
  @{title='基础连通'; body="域名解析正确`nHTTPS 证书有效`n/health 返回 ok"; fill=$cyan},
  @{title='Admin 可用'; body="能打开后台`n强密码已更换`n可登录并保存配置"; fill=$lightBlue},
  @{title='支付材料'; body="APPID 已填`n应用私钥已填`n支付宝公钥已填"; fill=$lightOrange},
  @{title='真实验收'; body="小额支付成功`n订单 paid`n商户 notify success"; fill=$lightGreen}
)
$i = 0
foreach ($item in $items) {
  $x = 90 + (($i % 2) * 1140)
  $y = 280 + ([math]::Floor($i / 2) * 400)
  Draw-Card $g $x $y 1050 340 $item.fill
  Draw-Text $g $item.title ($x + 40) ($y + 40) 970 80 38 $navy $true 'Near'
  Draw-Text $g $item.body ($x + 40) ($y + 140) 970 160 30 $gray $false 'Near'
  $i++
}
Save-Board $b '04-acceptance.png'
