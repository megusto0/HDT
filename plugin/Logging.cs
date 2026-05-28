using System;
using System.IO;

namespace HDTBgTracker
{
    public static class Logging
    {
        private static readonly object Sync = new object();

        public static string DataDir { get; } = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "HDTBgTracker");

        public static string LogPath => Path.Combine(DataDir, "plugin.log");

        public static void Info(string message)
        {
            Write("INFO", message);
        }

        public static void Error(Exception exception, string message)
        {
            Write("ERROR", message + " :: " + exception);
        }

        private static void Write(string level, string message)
        {
            lock (Sync)
            {
                Directory.CreateDirectory(DataDir);
                File.AppendAllText(LogPath, $"{DateTime.UtcNow:O} [{level}] {message}{Environment.NewLine}");
            }
        }
    }
}

