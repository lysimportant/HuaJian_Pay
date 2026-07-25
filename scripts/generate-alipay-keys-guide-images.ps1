param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\docs\assets\alipay-keys')
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
$red = [System.Drawing.ColorTranslator]::FromHtml('#D4380D')
$lightRed = [System.Drawing.ColorTranslator]::FromHtml('#FFF1F0')
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
  Draw-Text $g $title 90 45 ($width - 180) 90 54 $navy $true 'Near'
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

# 01 concepts
$b = New-Board 2400 1280; $g = $b.Graphics
Draw-Title $g '三种密钥别搞混：应用私钥 / 应用公钥 / 支付宝公钥' 'HuaJian_Pay 只需要你填写：应用私钥 + 支付宝公钥' 2400
$cards = @(
  @{x=90; title='应用私钥'; body="你自己生成并私密保存`n用于向支付宝发起请求签名`n填入 HuaJian_Pay 应用私钥"; fill=$lightBlue},
  @{x=850; title='应用公钥'; body="由应用私钥推导得出`n上传到支付宝开放平台`n不要填进 HuaJian_Pay"; fill=$lightOrange},
  @{x=1610; title='支付宝公钥'; body="支付宝开放平台返回`n用于验签支付宝回调`n填入 HuaJian_Pay 支付宝公钥"; fill=$lightGreen}
)
foreach ($c in $cards) {
  Draw-Card $g $c.x 300 700 360 $c.fill
  Draw-Text $g $c.title ($c.x + 30) 340 640 80 44 $navy $true
  Draw-Text $g $c.body ($c.x + 30) 440 640 180 30 $gray
}
Draw-Card $g 300 780 1800 320 $white $line 28
Draw-Text $g '最常见错误' 360 820 420 70 36 $red $true 'Near'
Draw-Text $g '1. 把应用公钥误填到“支付宝公钥”' 390 910 1600 55 30 $navy $false 'Near'
Draw-Text $g '2. 把支付宝公钥误填到“应用私钥”' 390 970 1600 55 30 $navy $false 'Near'
Draw-Text $g '3. 只复制了中间内容，丢失 BEGIN/END 或换行格式错误' 390 1030 1600 55 30 $navy $false 'Near'
Save-Board $b '01-key-concepts.png'

# 02 flow
$b = New-Board 2400 1180; $g = $b.Graphics
Draw-Title $g '获取并填写密钥的正确顺序' '先生成，再上传应用公钥，最后复制支付宝公钥' 2400
$steps = @(
  @{n='1'; title='生成 RSA2 密钥对'; body="密钥工具 / OpenSSL`n得到应用私钥 + 应用公钥"; x=90; fill=$cyan},
  @{n='2'; title='上传应用公钥'; body="开放平台`n接口加签方式 = RSA2"; x=570; fill=$lightBlue},
  @{n='3'; title='复制支付宝公钥'; body="开放平台返回`n不是应用公钥"; x=1050; fill=$lightOrange},
  @{n='4'; title='填写到 HuaJian_Pay'; body="应用私钥`n支付宝公钥"; x=1530; fill=$lightGreen},
  @{n='5'; title='保存并验收'; body="has_private_key=true`nhas_public_key=true"; x=2010; fill=$white}
)
foreach ($s in $steps) {
  Draw-Card $g $s.x 350 390 360 $s.fill
  Draw-Card $g ($s.x+135) 290 120 120 $blue $blue 60
  Draw-Text $g $s.n ($s.x+135) 292 120 112 50 $white $true
  Draw-Text $g $s.title ($s.x+25) 440 340 70 34 $navy $true
  Draw-Text $g $s.body ($s.x+25) 525 340 140 27 $gray
  if ($s.n -ne '5') { Draw-Arrow $g ($s.x+395) 530 ($s.x+470) 530 $blue 6 }
}
Draw-Card $g 300 850 1800 160 $navy $navy 24
Draw-Text $g '通过标准' 350 875 270 105 34 $white $true 'Near'
Draw-Text $g 'Admin 保存成功  ·  密钥字段不再报未配置  ·  可发起真实小额支付  ·  回调验签通过' 620 875 1410 105 28 $white $false 'Near'
Save-Board $b '02-key-setup-flow.png'

# 03 admin mapping
$b = New-Board 2400 1450; $g = $b.Graphics
Draw-Title $g '开放平台材料与 HuaJian_Pay 字段映射' '应用公钥只用于上传，不写入本平台' 2400
$cols = @(
  @{x=100; w=650; title='你手里的材料'; fill=$lightOrange},
  @{x=875; w=650; title='去哪里配置'; fill=$lightBlue},
  @{x=1650; w=650; title='HuaJian_Pay 字段'; fill=$lightGreen}
)
foreach ($c in $cols) { Draw-Card $g $c.x 270 $c.w 105 $c.fill; Draw-Text $g $c.title $c.x 275 $c.w 95 34 $navy $true }
$rows = @(
  @('APPID','开放平台应用详情','App ID'),
  @('应用私钥 PEM','私密保存 / 本平台','应用私钥'),
  @('应用公钥 PEM','开放平台接口加签','不填写到本平台'),
  @('支付宝公钥 PEM','开放平台加签结果','支付宝公钥'),
  @('异步通知 URL','开放平台 + 本平台','异步通知 URL'),
  @('同步跳转 URL','本平台可选','同步跳转 URL')
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
Draw-Text $g '安全规则：真实密钥禁止写入文档、截图、Git；Admin GET 永远不回显完整密钥。' 340 1325 1720 70 29 $white $true
Save-Board $b '03-field-mapping.png'

# 04 troubleshooting
$b = New-Board 2400 1280; $g = $b.Graphics
Draw-Title $g '保存时报“私钥/公钥未配置”怎么排查' '先确认填的是完整 PEM，再确认没有填错对象' 2400
$items = @(
  @{title='报错 1：应用私钥未配置'; body="检查是否粘贴了完整私钥`n是否包含 BEGIN PRIVATE KEY`n是否误把公钥粘贴进来"; fill=$lightRed},
  @{title='报错 2：支付宝公钥未配置'; body="检查是否粘贴了支付宝公钥`n不要填应用公钥`n不要只填 APPID"; fill=$lightOrange},
  @{title='格式建议'; body="支持完整 PEM`n可含 BEGIN/END 与换行`n不要截断中间内容"; fill=$lightBlue},
  @{title='保存后预期'; body="页面提示成功`n密钥输入框重新为空`n后台标记 has_xxx_key=true"; fill=$lightGreen}
)
$i = 0
foreach ($item in $items) {
  $x = 90 + (($i % 2) * 1140)
  $y = 280 + ([math]::Floor($i / 2) * 420)
  Draw-Card $g $x $y 1050 360 $item.fill
  Draw-Text $g $item.title ($x + 40) ($y + 40) 970 80 38 $navy $true 'Near'
  Draw-Text $g $item.body ($x + 40) ($y + 140) 970 180 30 $gray $false 'Near'
  $i++
}
Save-Board $b '04-troubleshooting.png'
