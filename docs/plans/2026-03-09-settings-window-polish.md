# Settings Window Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish SettingsWindow.xaml with aligned grid layout, segmented toggle controls, and swatch selection rings — no new behavior, pure visual improvement.

**Architecture:** Two-column Grid (90px label / fill control) replaces inline StackPanel rows across all tabs. A `SegmentButtonStyle` with minimal ControlTemplate replaces plain toggle Buttons. Accent swatch ring borders track the selected preset. All behavioral logic (events, `_suppressEvents`, etc.) is unchanged.

**Tech Stack:** WPF XAML (Window.Resources, Grid, Border, Style/DataTrigger/ControlTemplate), C# code-behind helpers.

---

### Task 1: Add SegmentButtonStyle to Window.Resources

**Files:**
- Modify: `FuzzyClock.App/SettingsWindow.xaml`

**Step 1: Add `<Window.Resources>` block before `<TabControl>`**

Replace the opening of the file so it reads:

```xml
<Window x:Class="FuzzyClock.App.SettingsWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="FuzzyClock Settings"
        Width="480" Height="510"
        ResizeMode="NoResize"
        ShowInTaskbar="False"
        WindowStartupLocation="CenterScreen">

    <Window.Resources>
        <!-- Segmented toggle button — rail container sets Background="#FFE8E8E8" CornerRadius="4" -->
        <Style x:Key="SegmentButtonStyle" TargetType="Button">
            <Setter Property="Padding" Value="12,4"/>
            <Setter Property="Background" Value="Transparent"/>
            <Setter Property="BorderThickness" Value="0"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="FocusVisualStyle" Value="{x:Null}"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}"
                                BorderBrush="{TemplateBinding BorderBrush}"
                                BorderThickness="{TemplateBinding BorderThickness}"
                                CornerRadius="3"
                                Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
            <Style.Triggers>
                <!-- Selected state: white pill with subtle border -->
                <DataTrigger Binding="{Binding Tag, RelativeSource={RelativeSource Self}}" Value="selected">
                    <Setter Property="Background" Value="#FFFFFFFF"/>
                    <Setter Property="BorderBrush" Value="#FFBDBDBD"/>
                    <Setter Property="BorderThickness" Value="1"/>
                </DataTrigger>
                <!-- Hover on unselected: light gray -->
                <MultiDataTrigger>
                    <MultiDataTrigger.Conditions>
                        <Condition Binding="{Binding IsMouseOver, RelativeSource={RelativeSource Self}}" Value="True"/>
                        <Condition Binding="{Binding Tag, RelativeSource={RelativeSource Self}}" Value="{x:Null}"/>
                    </MultiDataTrigger.Conditions>
                    <Setter Property="Background" Value="#FFD0D0D0"/>
                </MultiDataTrigger>
            </Style.Triggers>
        </Style>
    </Window.Resources>

    <TabControl Margin="8">
```

**Step 2: Build to verify resources parse**

```
cd C:/src/FuzzyStatsClock && dotnet build FuzzyClock.App/FuzzyClock.App.csproj -c Release --no-restore -v quiet 2>&1 | tail -5
```

Expected: `Build succeeded. 0 Error(s)`

**Step 3: Commit**

```
git add FuzzyClock.App/SettingsWindow.xaml
git commit -m "style(settings): add SegmentButtonStyle resource and grow window to 510px"
```

---

### Task 2: Rewrite Appearance tab

**Files:**
- Modify: `FuzzyClock.App/SettingsWindow.xaml`

**Step 1: Replace the entire Appearance TabItem content**

The current Appearance tab is a flat StackPanel with 5 rows. Replace it entirely:

```xml
        <!-- ===== APPEARANCE TAB ===== -->
        <TabItem Header="Appearance">
            <StackPanel Margin="12">

                <!-- Accent Color header + swatch row (no grid — horizontal layout) -->
                <TextBlock Text="Accent Color" FontWeight="SemiBold" Margin="0,0,0,6"/>
                <StackPanel Orientation="Horizontal">
                    <!-- Each swatch: outer ring Border (named RingX) wrapping the colored swatch Border -->
                    <Border x:Name="RingWhite" BorderThickness="0" CornerRadius="6" Padding="2" Margin="0,0,4,0">
                        <Border x:Name="SwatchWhite" Width="28" Height="28" Background="#FFFFFFFF"
                                CornerRadius="4" Cursor="Hand"
                                BorderBrush="#FFAAAAAA" BorderThickness="1"
                                MouseLeftButtonDown="SwatchWhite_MouseLeftButtonDown">
                            <Border.Style>
                                <Style TargetType="Border">
                                    <Style.Triggers>
                                        <Trigger Property="IsMouseOver" Value="True">
                                            <Setter Property="Opacity" Value="0.75"/>
                                        </Trigger>
                                    </Style.Triggers>
                                </Style>
                            </Border.Style>
                        </Border>
                    </Border>
                    <Border x:Name="RingAmber" BorderThickness="0" CornerRadius="6" Padding="2" Margin="0,0,4,0">
                        <Border x:Name="SwatchAmber" Width="28" Height="28" Background="#FFFFC000"
                                CornerRadius="4" Cursor="Hand"
                                MouseLeftButtonDown="SwatchAmber_MouseLeftButtonDown">
                            <Border.Style>
                                <Style TargetType="Border">
                                    <Style.Triggers>
                                        <Trigger Property="IsMouseOver" Value="True">
                                            <Setter Property="Opacity" Value="0.75"/>
                                        </Trigger>
                                    </Style.Triggers>
                                </Style>
                            </Border.Style>
                        </Border>
                    </Border>
                    <Border x:Name="RingIce" BorderThickness="0" CornerRadius="6" Padding="2" Margin="0,0,4,0">
                        <Border x:Name="SwatchIce" Width="28" Height="28" Background="#FF87CEEB"
                                CornerRadius="4" Cursor="Hand"
                                MouseLeftButtonDown="SwatchIce_MouseLeftButtonDown">
                            <Border.Style>
                                <Style TargetType="Border">
                                    <Style.Triggers>
                                        <Trigger Property="IsMouseOver" Value="True">
                                            <Setter Property="Opacity" Value="0.75"/>
                                        </Trigger>
                                    </Style.Triggers>
                                </Style>
                            </Border.Style>
                        </Border>
                    </Border>
                    <Border x:Name="RingGreen" BorderThickness="0" CornerRadius="6" Padding="2" Margin="0,0,4,0">
                        <Border x:Name="SwatchGreen" Width="28" Height="28" Background="#FF00C000"
                                CornerRadius="4" Cursor="Hand"
                                MouseLeftButtonDown="SwatchGreen_MouseLeftButtonDown">
                            <Border.Style>
                                <Style TargetType="Border">
                                    <Style.Triggers>
                                        <Trigger Property="IsMouseOver" Value="True">
                                            <Setter Property="Opacity" Value="0.75"/>
                                        </Trigger>
                                    </Style.Triggers>
                                </Style>
                            </Border.Style>
                        </Border>
                    </Border>
                    <Border x:Name="RingPink" BorderThickness="0" CornerRadius="6" Padding="2" Margin="0,0,8,0">
                        <Border x:Name="SwatchPink" Width="28" Height="28" Background="#FFFF69B4"
                                CornerRadius="4" Cursor="Hand"
                                MouseLeftButtonDown="SwatchPink_MouseLeftButtonDown">
                            <Border.Style>
                                <Style TargetType="Border">
                                    <Style.Triggers>
                                        <Trigger Property="IsMouseOver" Value="True">
                                            <Setter Property="Opacity" Value="0.75"/>
                                        </Trigger>
                                    </Style.Triggers>
                                </Style>
                            </Border.Style>
                        </Border>
                    </Border>
                    <Button x:Name="BtnCustomColor" Content="Custom..." Padding="8,4"
                            VerticalAlignment="Center" Click="BtnCustomColor_Click"/>
                </StackPanel>

                <!-- Two-column Grid for the remaining rows -->
                <Grid Margin="0,14,0,0">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="90"/>
                        <ColumnDefinition Width="*"/>
                    </Grid.ColumnDefinitions>
                    <Grid.RowDefinitions>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="Auto"/>
                    </Grid.RowDefinitions>

                    <!-- Opacity -->
                    <TextBlock Grid.Row="0" Grid.Column="0"
                               Text="Opacity" VerticalAlignment="Center"
                               HorizontalAlignment="Right" Margin="0,0,10,0"/>
                    <StackPanel Grid.Row="0" Grid.Column="1" Orientation="Horizontal">
                        <Slider x:Name="OpacitySlider"
                                Minimum="0.20" Maximum="1.00"
                                SmallChange="0.01" LargeChange="0.05"
                                TickFrequency="0.05" IsSnapToTickEnabled="False"
                                Width="160" VerticalAlignment="Center"
                                ValueChanged="OpacitySlider_ValueChanged"/>
                        <TextBlock x:Name="OpacityLabel" Width="36"
                                   VerticalAlignment="Center" Margin="6,0,0,0"/>
                    </StackPanel>

                    <!-- Font Size -->
                    <TextBlock Grid.Row="1" Grid.Column="0"
                               Text="Font Size" VerticalAlignment="Center"
                               HorizontalAlignment="Right" Margin="0,8,10,0"/>
                    <Border Grid.Row="1" Grid.Column="1"
                            Background="#FFE8E8E8" CornerRadius="4" Padding="2"
                            HorizontalAlignment="Left" Margin="0,8,0,0">
                        <StackPanel Orientation="Horizontal">
                            <Button x:Name="BtnFontS"  Content="S"  Style="{StaticResource SegmentButtonStyle}" Click="BtnFontS_Click"/>
                            <Button x:Name="BtnFontM"  Content="M"  Style="{StaticResource SegmentButtonStyle}" Click="BtnFontM_Click"/>
                            <Button x:Name="BtnFontL"  Content="L"  Style="{StaticResource SegmentButtonStyle}" Click="BtnFontL_Click"/>
                            <Button x:Name="BtnFontXL" Content="XL" Style="{StaticResource SegmentButtonStyle}" Click="BtnFontXL_Click"/>
                        </StackPanel>
                    </Border>

                    <!-- Clock Style -->
                    <TextBlock Grid.Row="2" Grid.Column="0"
                               Text="Clock Style" VerticalAlignment="Center"
                               HorizontalAlignment="Right" Margin="0,8,10,0"/>
                    <Border Grid.Row="2" Grid.Column="1"
                            Background="#FFE8E8E8" CornerRadius="4" Padding="2"
                            HorizontalAlignment="Left" Margin="0,8,0,0">
                        <StackPanel Orientation="Horizontal">
                            <Button x:Name="BtnPhrase" Content="Phrase" Style="{StaticResource SegmentButtonStyle}" Click="BtnPhrase_Click"/>
                            <Button x:Name="BtnDial"   Content="Dial"   Style="{StaticResource SegmentButtonStyle}" Click="BtnDial_Click"/>
                        </StackPanel>
                    </Border>

                    <!-- Phrase Style -->
                    <TextBlock Grid.Row="3" Grid.Column="0"
                               Text="Phrase Style" VerticalAlignment="Center"
                               HorizontalAlignment="Right" Margin="0,8,10,0"/>
                    <ComboBox x:Name="CmbPhraseStyle"
                              Grid.Row="3" Grid.Column="1"
                              Width="120" HorizontalAlignment="Left"
                              Margin="0,8,0,0" VerticalAlignment="Center"
                              SelectionChanged="CmbPhraseStyle_SelectionChanged">
                        <ComboBoxItem Content="Classic"/>
                    </ComboBox>

                </Grid>

            </StackPanel>
        </TabItem>
```

**Step 2: Build**

```
cd C:/src/FuzzyStatsClock && dotnet build FuzzyClock.App/FuzzyClock.App.csproj -c Release --no-restore -v quiet 2>&1 | tail -5
```

Expected: `Build succeeded. 0 Error(s)`

**Step 3: Commit**

```
git add FuzzyClock.App/SettingsWindow.xaml
git commit -m "style(settings): rewrite Appearance tab with grid layout, segmented controls, swatch rings"
```

---

### Task 3: Rewrite Stats and Behavior tabs

**Files:**
- Modify: `FuzzyClock.App/SettingsWindow.xaml`

**Step 1: Replace the Stats TabItem content**

```xml
        <!-- ===== STATS TAB ===== -->
        <TabItem Header="Stats">
            <StackPanel Margin="12">

                <CheckBox x:Name="ChkStatsVisible" Content="Show Stats Panel"
                          Margin="0,0,0,10"
                          Checked="ChkStatsVisible_Changed" Unchecked="ChkStatsVisible_Changed"/>

                <Grid>
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="90"/>
                        <ColumnDefinition Width="*"/>
                    </Grid.ColumnDefinitions>
                    <Grid.RowDefinitions>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="Auto"/>
                    </Grid.RowDefinitions>

                    <!-- Visible Rows (WrapPanel — 2 rows of 3) -->
                    <TextBlock Grid.Row="0" Grid.Column="0"
                               Text="Rows" VerticalAlignment="Top"
                               HorizontalAlignment="Right" Margin="0,3,10,0"/>
                    <WrapPanel Grid.Row="0" Grid.Column="1" Width="270">
                        <CheckBox x:Name="ChkCpuVisible"    Content="CPU"     Width="86" Margin="0,0,0,5"
                                  Checked="ChkCpuVisible_Changed"    Unchecked="ChkCpuVisible_Changed"/>
                        <CheckBox x:Name="ChkGpuVisible"    Content="GPU"     Width="86" Margin="0,0,0,5"
                                  Checked="ChkGpuVisible_Changed"    Unchecked="ChkGpuVisible_Changed"/>
                        <CheckBox x:Name="ChkMemVisible"    Content="Memory"  Width="86" Margin="0,0,0,5"
                                  Checked="ChkMemVisible_Changed"    Unchecked="ChkMemVisible_Changed"/>
                        <CheckBox x:Name="ChkPagVisible"    Content="Paging"  Width="86"
                                  Checked="ChkPagVisible_Changed"    Unchecked="ChkPagVisible_Changed"/>
                        <CheckBox x:Name="ChkBattVisible"   Content="Battery" Width="86"
                                  Checked="ChkBattVisible_Changed"   Unchecked="ChkBattVisible_Changed"/>
                        <CheckBox x:Name="ChkUptimeVisible" Content="Uptime"  Width="86"
                                  Checked="ChkUptimeVisible_Changed" Unchecked="ChkUptimeVisible_Changed"/>
                    </WrapPanel>

                    <!-- Update Interval -->
                    <TextBlock Grid.Row="1" Grid.Column="0"
                               Text="Interval" VerticalAlignment="Center"
                               HorizontalAlignment="Right" Margin="0,12,10,0"/>
                    <ComboBox x:Name="CmbStatsInterval"
                              Grid.Row="1" Grid.Column="1"
                              Width="110" HorizontalAlignment="Left"
                              Margin="0,12,0,0" VerticalAlignment="Center"
                              SelectionChanged="CmbStatsInterval_SelectionChanged">
                        <ComboBoxItem Content="1 second"/>
                        <ComboBoxItem Content="3 seconds"/>
                        <ComboBoxItem Content="10 seconds"/>
                    </ComboBox>

                    <!-- Process Threshold -->
                    <TextBlock Grid.Row="2" Grid.Column="0"
                               Text="Threshold" VerticalAlignment="Center"
                               HorizontalAlignment="Right" Margin="0,12,10,0"/>
                    <StackPanel Grid.Row="2" Grid.Column="1"
                                Orientation="Horizontal" Margin="0,12,0,0">
                        <RadioButton x:Name="RbThresh2"  Content="2%"  GroupName="ProcessThresh"
                                     Margin="0,0,14,0" Checked="RbThresh2_Checked"/>
                        <RadioButton x:Name="RbThresh5"  Content="5%"  GroupName="ProcessThresh"
                                     Margin="0,0,14,0" Checked="RbThresh5_Checked"/>
                        <RadioButton x:Name="RbThresh10" Content="10%" GroupName="ProcessThresh"
                                     Checked="RbThresh10_Checked"/>
                    </StackPanel>

                    <!-- Show Date -->
                    <TextBlock Grid.Row="3" Grid.Column="0"
                               Text="Date" VerticalAlignment="Center"
                               HorizontalAlignment="Right" Margin="0,12,10,0"/>
                    <CheckBox x:Name="ChkShowDate"
                              Grid.Row="3" Grid.Column="1"
                              Content="Show Date" Margin="0,12,0,0" VerticalAlignment="Center"
                              Checked="ChkShowDate_Changed" Unchecked="ChkShowDate_Changed"/>

                    <!-- Date Format -->
                    <TextBlock Grid.Row="4" Grid.Column="0"
                               Text="Date Format" VerticalAlignment="Center"
                               HorizontalAlignment="Right" Margin="0,8,10,0"/>
                    <ComboBox x:Name="CmbDateFormat"
                              Grid.Row="4" Grid.Column="1"
                              Width="100" HorizontalAlignment="Left"
                              Margin="0,8,0,0" VerticalAlignment="Center"
                              SelectionChanged="CmbDateFormat_SelectionChanged">
                        <ComboBoxItem Content="Short"/>
                        <ComboBoxItem Content="Long"/>
                        <ComboBoxItem Content="Numeric"/>
                        <ComboBoxItem Content="ISO"/>
                    </ComboBox>

                </Grid>

            </StackPanel>
        </TabItem>
```

**Step 2: Replace the Behavior TabItem content**

```xml
        <!-- ===== BEHAVIOR TAB ===== -->
        <TabItem Header="Behavior">
            <StackPanel Margin="12">

                <CheckBox x:Name="ChkGhostMode"
                          Content="Ghost Mode — auto-hide widget on hover"
                          Margin="0,0,0,10"
                          Checked="ChkGhostMode_Changed" Unchecked="ChkGhostMode_Changed"/>
                <CheckBox x:Name="ChkAutoContrast"
                          Content="Auto-Contrast — WCAG luminance sampling"
                          Margin="0,0,0,10"
                          Checked="ChkAutoContrast_Changed" Unchecked="ChkAutoContrast_Changed"/>
                <CheckBox x:Name="ChkAutoLaunch"
                          Content="Auto-Launch at Login"
                          Checked="ChkAutoLaunch_Changed" Unchecked="ChkAutoLaunch_Changed"/>

            </StackPanel>
        </TabItem>
```

**Step 3: Build**

```
cd C:/src/FuzzyStatsClock && dotnet build FuzzyClock.App/FuzzyClock.App.csproj -c Release --no-restore -v quiet 2>&1 | tail -5
```

Expected: `Build succeeded. 0 Error(s)`

**Step 4: Commit**

```
git add FuzzyClock.App/SettingsWindow.xaml
git commit -m "style(settings): rewrite Stats and Behavior tabs with grid layout"
```

---

### Task 4: Update code-behind helpers

**Files:**
- Modify: `FuzzyClock.App/SettingsWindow.xaml.cs`

**Step 1: Replace `SetFontSizeButtonStates` — use Tag instead of FontWeight**

Find and replace the method:

```csharp
private void SetFontSizeButtonStates(int size)
{
    BtnFontS.Tag  = size == 16 ? "selected" : null;
    BtnFontM.Tag  = size == 24 ? "selected" : null;
    BtnFontL.Tag  = size == 32 ? "selected" : null;
    BtnFontXL.Tag = size == 40 ? "selected" : null;
}
```

**Step 2: Replace `SetClockStyleButtonStates` — use Tag instead of FontWeight**

```csharp
private void SetClockStyleButtonStates(bool dialMode)
{
    BtnPhrase.Tag = !dialMode ? "selected" : null;
    BtnDial.Tag   =  dialMode ? "selected" : null;
}
```

**Step 3: Add `SetActiveSwatch` helper after `SetClockStyleButtonStates`**

```csharp
private void SetActiveSwatch(Border? activeRing)
{
    var rings = new[] { RingWhite, RingAmber, RingIce, RingGreen, RingPink };
    var blue  = new SolidColorBrush(Color.FromRgb(0x00, 0x78, 0xD4));
    foreach (var r in rings)
    {
        r.BorderThickness = new Thickness(0);
        r.BorderBrush     = null;
    }
    if (activeRing is not null)
    {
        activeRing.BorderThickness = new Thickness(2);
        activeRing.BorderBrush     = blue;
    }
}
```

**Step 4: Update `PopulateControls` — add swatch ring initialisation at the end of the method**

After the last existing line (`ChkAutoLaunch.IsChecked = s.AutoLaunchEnabled;`), add:

```csharp
// Accent swatch selection ring
var ac = s.AccentColor;
Border? ring =
    ac == Color.FromArgb(0xFF, 0xFF, 0xFF, 0xFF) ? RingWhite  :
    ac == Color.FromArgb(0xFF, 0xFF, 0xC0, 0x00) ? RingAmber  :
    ac == Color.FromArgb(0xFF, 0x87, 0xCE, 0xEB) ? RingIce    :
    ac == Color.FromArgb(0xFF, 0x00, 0xC0, 0x00) ? RingGreen  :
    ac == Color.FromArgb(0xFF, 0xFF, 0x69, 0xB4) ? RingPink   : null;
SetActiveSwatch(ring);
```

**Step 5: Update each swatch click handler — call `SetActiveSwatch` before firing the event**

Pattern for each of the 5 handlers:

```csharp
private void SwatchWhite_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    if (_suppressEvents) return;
    SetActiveSwatch(RingWhite);
    AccentColorChanged?.Invoke(((SolidColorBrush)SwatchWhite.Background).Color);
}

private void SwatchAmber_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    if (_suppressEvents) return;
    SetActiveSwatch(RingAmber);
    AccentColorChanged?.Invoke(((SolidColorBrush)SwatchAmber.Background).Color);
}

private void SwatchIce_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    if (_suppressEvents) return;
    SetActiveSwatch(RingIce);
    AccentColorChanged?.Invoke(((SolidColorBrush)SwatchIce.Background).Color);
}

private void SwatchGreen_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    if (_suppressEvents) return;
    SetActiveSwatch(RingGreen);
    AccentColorChanged?.Invoke(((SolidColorBrush)SwatchGreen.Background).Color);
}

private void SwatchPink_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    if (_suppressEvents) return;
    SetActiveSwatch(RingPink);
    AccentColorChanged?.Invoke(((SolidColorBrush)SwatchPink.Background).Color);
}
```

Also update `BtnCustomColor_Click` — clear the ring when a custom colour is picked (no preset matches):

```csharp
private void BtnCustomColor_Click(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;

    var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
    using var dlg = new System.Windows.Forms.ColorDialog
    {
        AllowFullOpen = true,
        FullOpen      = true,
    };

    if (dlg.ShowDialog(new Win32Window(hwnd)) == System.Windows.Forms.DialogResult.OK)
    {
        var c = dlg.Color;
        SetActiveSwatch(null);   // custom colour — clear any preset ring
        AccentColorChanged?.Invoke(Color.FromArgb(c.A, c.R, c.G, c.B));
    }
}
```

**Step 6: Build and run full test suite**

```
cd C:/src/FuzzyStatsClock && dotnet build FuzzyClock.App/FuzzyClock.App.csproj -c Release --no-restore -v quiet 2>&1 | tail -5
```

```
cd C:/src/FuzzyStatsClock && dotnet test -c Release 2>&1 | tail -6
```

Expected: `Build succeeded. 0 Error(s)` and all 126 tests pass.

**Step 7: Commit**

```
git add FuzzyClock.App/SettingsWindow.xaml.cs
git commit -m "style(settings): update toggle helpers to Tag-based selection, add SetActiveSwatch"
```
