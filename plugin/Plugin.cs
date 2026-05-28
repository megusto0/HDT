using System;
using System.Windows.Controls;
using Hearthstone_Deck_Tracker.Plugins;

namespace HDTBgTracker
{
    public sealed class Plugin : IPlugin
    {
        private readonly DataStore _store = new DataStore();
        private GameTracker? _tracker;

        public string Name => "HDT Battlegrounds Tracker";
        public string Description => "Records local Battlegrounds analytics to SQLite and JSON.";
        public string ButtonText => "HDT BG Tracker";
        public string Author => "hecol + Codex";
        public Version Version => new Version(0, 1, 0);
        public MenuItem MenuItem => null!;

        public void OnLoad()
        {
            try
            {
                _store.EnsureCreated();
                _tracker = new GameTracker(_store);
                _tracker.Start();
                Logging.Info("Loaded HDT Battlegrounds Tracker 0.1.0");
            }
            catch (Exception exception)
            {
                Logging.Error(exception, "Plugin load failed");
                throw;
            }
        }

        public void OnUnload()
        {
            _tracker?.Dispose();
            Logging.Info("Unloaded");
        }

        public void OnButtonPress()
        {
            Logging.Info("Plugin button pressed");
        }

        public void OnUpdate()
        {
        }
    }
}
