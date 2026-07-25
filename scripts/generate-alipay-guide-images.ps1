param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\docs\assets\alipay-channel')
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
  Draw-Text $g $title 90 45 ($width - 180) 90 58 $navy $true 'Near'
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

# 01 — architecture
$b = New-Board 2400 1180; $g = $b.Graphics
Draw-Title $g '支付宝官方通道：下单、支付与回调闭环' 'HuaJian_Pay · RSA2 · 易支付兼容 · 异步通知幂等' 2400
$cards = @(
  @{x=90; title='newapi / 商户'; body='提交 type=alipay`nMD5 商户签名'; fill=$cyan},
  @{x=660; title='HuaJian_Pay'; body='创建订单并调用`nalipay.trade.precreate'; fill=$lightBlue},
  @{x=1230; title='支付宝开放平台'; body='RSA2 验签`n返回扫码支付信息'; fill=$lightOrange},
  @{x=1800; title='付款用户'; body='打开支付页`n扫码完成付款'; fill=$lightGreen}
)
foreach ($c in $cards) {
  Draw-Card $g $c.x 300 500 260 $c.fill
  Draw-Text $g $c.title ($c.x + 30) 325 440 80 40 $navy $true
  Draw-Text $g $c.body ($c.x + 30) 410 440 115 29 $gray
}
Draw-Arrow $g 590 430 650 430
Draw-Arrow $g 1160 430 1220 430
Draw-Arrow $g 1730 430 1790 430
Draw-Card $g 300 720 1800 300 $white $line 28
Draw-Text $g '异步支付结果' 360 750 360 70 36 $blue $true 'Near'
Draw-Text $g '1  支付宝 → POST /channels/alipay/notify' 390 830 790 55 30 $navy $false 'Near'
Draw-Text $g '2  RSA2 验签 + 金额/订单状态校验 + 幂等置 paid' 390 890 1050 55 30 $navy $false 'Near'
Draw-Text $g '3  HuaJian_Pay → 商户 notify_url，商户返回 success' 390 950 1150 55 30 $navy $false 'Near'
Draw-Arrow $g 1480 950 1980 950 $green 6
Save-Board $b '01-architecture-flow.png'

# 02 — field mapping
$b = New-Board 2400 1450; $g = $b.Graphics
Draw-Title $g '支付宝开放平台与 HuaJian_Pay 字段映射' '密钥只写入，不回显；空值表示保留原配置' 2400
$cols = @(
  @{x=100; w=650; title='支付宝开放平台 / 材料'; fill=$lightOrange},
  @{x=875; w=650; title='环境变量（.env）'; fill=$lightBlue},
  @{x=1650; w=650; title='Admin 配置字段'; fill=$lightGreen}
)
foreach ($c in $cols) { Draw-Card $g $c.x 270 $c.w 105 $c.fill; Draw-Text $g $c.title $c.x 275 $c.w 95 34 $navy $true }
$rows = @(
  @('应用 APPID','ALIPAY_APP_ID','App ID'),
  @('应用私钥 PEM','ALIPAY_PRIVATE_KEY','应用私钥（不回显）'),
  @('支付宝公钥 PEM','ALIPAY_PUBLIC_KEY','支付宝公钥（不回显）'),
  @('异步通知地址','ALIPAY_NOTIFY_URL','异步通知 URL'),
  @('同步跳转地址','ALIPAY_RETURN_URL','同步跳转 URL'),
  @('结算备注（可选）','ALIPAY_ACCOUNT','结算账户备注')
)
for ($i=0; $i -lt $rows.Count; $i++) {
  $y = 420 + ($i * 145)
  $rowFill = if ($i % 2 -eq 0) { $white } else { [System.Drawing.ColorTranslator]::FromHtml('#F0F5FA') }
  foreach ($c in $cols) { Draw-Card $g $c.x $y $c.w 105 $rowFill $line 16 }
  Draw-Text $g $rows[$i][0] 125 ($y+8) 600 90 30 $navy $false
  Draw-Text $g $rows[$i][1] 900 ($y+8) 600 90 29 $blue $true
  Draw-Text $g $rows[$i][2] 1675 ($y+8) 600 90 30 $navy $false
  Draw-Arrow $g 760 ($y+52) 855 ($y+52) $line 5
  Draw-Arrow $g 1535 ($y+52) 1630 ($y+52) $line 5
}
Draw-Card $g 300 1320 1800 80 $navy $navy 18
Draw-Text $g '安全规则：GET 只返回 has_private_key / has_public_key；PUT 留空保留，填写才替换。' 340 1325 1720 70 29 $white $true
Save-Board $b '02-field-mapping.png'

# 03 — admin page mock
$b = New-Board 2400 1700; $g = $b.Graphics
Draw-Title $g 'Admin 支付宝通道配置页（高清脱敏示意）' '所有 APPID、密钥与域名均为伪造示例，不可用于生产' 2400
Draw-Card $g 90 260 2220 1330 $white $line 28
Draw-Card $g 90 260 420 1330 $navy $navy 28
Draw-Text $g 'HuaJian Pay' 140 300 320 70 38 $white $true
$menus = @('仪表盘','订单中心','支付宝通道','微信通道','商户管理','系统设置')
for ($i=0; $i -lt $menus.Count; $i++) {
  $y = 430 + $i*95
  if ($menus[$i] -eq '支付宝通道') { Draw-Card $g 125 $y 350 68 $blue $blue 14 }
  Draw-Text $g $menus[$i] 155 $y 290 68 28 $white ($menus[$i] -eq '支付宝通道') 'Near'
}
Draw-Text $g '支付宝通道' 590 315 750 75 48 $navy $true 'Near'
Draw-Card $g 1880 320 310 58 $lightGreen $green 29
Draw-Text $g 'CHANNEL_MODE=alipay' 1890 320 290 58 23 $green $true
$fields = @(
  @{label='App ID'; value='2026••••••••1234'; y=450},
  @{label='应用私钥'; value='已配置 · 输入框留空表示保留原值'; y=620},
  @{label='支付宝公钥'; value='已配置 · 输入框留空表示保留原值'; y=790},
  @{label='异步通知 URL'; value='https://pay.example.com/channels/alipay/notify'; y=960},
  @{label='同步跳转 URL'; value='https://pay.example.com/'; y=1130},
  @{label='结算账户备注'; value='运营备注（非收款凭据）'; y=1300}
)
foreach ($f in $fields) {
  Draw-Text $g $f.label 610 $f.y 420 55 28 $navy $true 'Near'
  Draw-Card $g 610 ($f.y+62) 1480 80 $bg $line 14
  Draw-Text $g $f.value 645 ($f.y+68) 1410 68 27 $gray $false 'Near'
}
Draw-Card $g 1840 1460 250 78 $blue $blue 16
Draw-Text $g '保存配置' 1840 1465 250 68 30 $white $true
Save-Board $b '03-admin-alipay-config-desensitized.png'

# 04 — acceptance flow
$b = New-Board 2400 1160; $g = $b.Graphics
Draw-Title $g '从 Mock 到真实小额支付：验收流程' '先验证平台链路，再接真实支付宝，最后检查回调与幂等' 2400
$steps = @(
  @{n='1'; title='Mock 联调'; body='CHANNEL_MODE=mock`npnpm test:mock-e2e'; x=90; fill=$cyan},
  @{n='2'; title='配置 RSA2'; body='APPID + 应用私钥`n+ 支付宝公钥'; x=570; fill=$lightBlue},
  @{n='3'; title='公网 HTTPS'; body='确认 notify URL`n与反向代理原始 body'; x=1050; fill=$lightOrange},
  @{n='4'; title='真实小额支付'; body='创建最小金额订单`n扫码完成付款'; x=1530; fill=$lightGreen},
  @{n='5'; title='结果核验'; body='paid + 商户 success`n重复通知不重复入账'; x=2010; fill=$white}
)
foreach ($s in $steps) {
  Draw-Card $g $s.x 350 390 360 $s.fill
  Draw-Card $g ($s.x+135) 290 120 120 $blue $blue 60
  Draw-Text $g $s.n ($s.x+135) 292 120 112 50 $white $true
  Draw-Text $g $s.title ($s.x+25) 440 340 70 36 $navy $true
  Draw-Text $g $s.body ($s.x+25) 525 340 130 27 $gray
  if ($s.n -ne '5') { Draw-Arrow $g ($s.x+395) 530 ($s.x+470) 530 $blue 6 }
}
Draw-Card $g 300 850 1800 160 $navy $navy 24
Draw-Text $g '通过标准' 350 875 270 105 34 $white $true 'Near'
Draw-Text $g 'RSA2 验签成功  ·  金额一致  ·  订单变为 paid  ·  商户通知返回 success  ·  重复通知幂等' 620 875 1410 105 28 $white $false 'Near'
Save-Board $b '04-acceptance-callback-flow.png'
