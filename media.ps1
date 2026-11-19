# Bridge to Windows media controls (Spotify, Apple Music, browsers, ...).
# stdout: JSON lines  {type:'track', title, artist, status, art, app}  and  {type:'time', pos, dur, upd, status}
# stdin : commands    toggle | next | prev
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$MgrT    = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$PropsT  = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$StreamT = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
# PowerShell can't call members on raw WinRT streams; go through reflection.
$AsRead  = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

# Foreground-window full-screen detection (for "hide glow over full-screen apps").
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class GlowFG {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  public static string Check() {
    try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch {}   // physical pixels on every monitor
    IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return "0";
    StringBuilder sb = new StringBuilder(256); GetClassName(h, sb, 256); string cls = sb.ToString();
    if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return "0";
    RECT r; if (!GetWindowRect(h, out r)) return "0";
    MONITORINFO mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return "0";
    uint pid; GetWindowThreadProcessId(h, out pid);
    RECT m = mi.rcMonitor;
    bool fs = r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B;
    return fs ? ("1|" + pid + "|" + m.L + "|" + m.T + "|" + (m.R - m.L) + "|" + (m.B - m.T)) : "0";
  }
}
'@

$mgr = Await ($MgrT::RequestAsync()) $MgrT
$lastTrack = $null; $lastTime = $null; $lastFg = $null; $lastHb = [DateTime]::MinValue

function NowPosMs($s) {
  $t = $s.GetTimelineProperties()
  $ms = $t.Position.TotalMilliseconds
  if ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') {
    $ms += ([DateTimeOffset]::UtcNow - $t.LastUpdatedTime).TotalMilliseconds
  }
  [Math]::Max(0, [Math]::Min($ms, $t.EndTime.TotalMilliseconds))
}

function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

# Non-blocking stdin: a StreamReader over the raw stream reads on the thread pool.
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$readTask = $stdin.ReadLineAsync()

while ($true) {
  try {
    $s = $mgr.GetCurrentSession()

    while ($readTask.IsCompleted) {
      $cmd = $readTask.Result
      if ($null -eq $cmd) { exit 0 }                    # parent closed stdin
      $readTask = $stdin.ReadLineAsync()
      if ($s) {
        $c = $cmd.Trim()
        switch -regex ($c) {
          '^toggle$' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
          '^next$'   { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
          '^prev$'   { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
          '^seek (-?\d+)$' {
            $target = [Math]::Max(0, (NowPosMs $s) + [double]$Matches[1])
            $null = Await ($s.TryChangePlaybackPositionAsync([int64]($target * 10000))) ([bool])
          }
        }
      }
      $lastTime = $null                                 # force a fresh timeline report
    }

    if (-not $s) {
      if ($lastTrack -ne 'none') { Emit @{ type = 'track'; title = ''; artist = ''; status = 'None'; art = ''; app = '' }; $lastTrack = 'none' }
    } else {
      $p = Await ($s.TryGetMediaPropertiesAsync()) $PropsT
      $status = $s.GetPlaybackInfo().PlaybackStatus.ToString()
      $hasArt = [bool]$p.Thumbnail
      $key = "$($p.Title)|$($p.Artist)|$hasArt"
      if ($key -ne $lastTrack) {
        $b64 = ''
        if ($hasArt) {
          $stream = Await ($p.Thumbnail.OpenReadAsync()) $StreamT
          $net = $AsRead.Invoke($null, @($stream))
          $ms = New-Object System.IO.MemoryStream
          $net.CopyTo($ms); $net.Close()
          if ($ms.Length -gt 0) { $b64 = [Convert]::ToBase64String($ms.ToArray()) }
          $ms.Dispose(); $stream = $null
        }
        Emit @{ type = 'track'; title = $p.Title; artist = $p.Artist; status = $status; art = $b64; app = $s.SourceAppUserModelId }
        $lastTrack = $key; $lastTime = $null
      }

      $t = $s.GetTimelineProperties()
      $tkey = "$($t.LastUpdatedTime.Ticks)|$($t.Position.Ticks)|$status"
      if ($tkey -ne $lastTime) {
        $ctl = $s.GetPlaybackInfo().Controls
        Emit @{ type = 'time'; status = $status; canSeek = [bool]$ctl.IsPlaybackPositionEnabled
                pos = [int64]$t.Position.TotalMilliseconds
                dur = [int64]$t.EndTime.TotalMilliseconds
                upd = $t.LastUpdatedTime.ToUnixTimeMilliseconds() }
        $lastTime = $tkey
      }
    }
  } catch { [Console]::Error.WriteLine("media.ps1: $($_.Exception.Message) @ line $($_.InvocationInfo.ScriptLineNumber)") }

  try {
    $fg = [GlowFG]::Check()
    if ($fg -ne $lastFg) {
      $f = $fg.Split('|')
      if ($f[0] -eq '1') { Emit @{ type = 'fg'; fs = $true; pid = [int]$f[1]; x = [int]$f[2]; y = [int]$f[3]; w = [int]$f[4]; h = [int]$f[5] } }
      else { Emit @{ type = 'fg'; fs = $false } }
      $lastFg = $fg
    }
  } catch {}

  if (([DateTime]::UtcNow - $lastHb).TotalSeconds -ge 4) { Emit @{ type = 'hb' }; $lastHb = [DateTime]::UtcNow }
  Start-Sleep -Milliseconds 350
}
