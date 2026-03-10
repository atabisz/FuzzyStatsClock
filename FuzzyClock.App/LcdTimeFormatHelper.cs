namespace FuzzyClock.App;

public static class LcdTimeFormatHelper
{
    public static string FormatTime(System.DateTime now, bool use24Hr, bool showSeconds)
    {
        if (use24Hr)
        {
            return showSeconds
                ? $"{now.Hour:D2}:{now.Minute:D2}:{now.Second:D2}"
                : $"{now.Hour:D2}:{now.Minute:D2}";
        }
        else
        {
            int h = now.Hour % 12;
            if (h == 0) h = 12;
            string hourStr = h < 10 ? $" {h}" : $"{h}";
            return showSeconds
                ? $"{hourStr}:{now.Minute:D2}:{now.Second:D2}"
                : $"{hourStr}:{now.Minute:D2}";
        }
    }
}
