using System;
using System.Collections.Generic;

namespace HDTBgTracker.Models
{
    public sealed class GameRecord
    {
        public string Id { get; set; } = "";
        public int SchemaVersion { get; set; } = 1;
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public string HeroId { get; set; } = "";
        public string HeroName { get; set; } = "";
        public int? Placement { get; set; }
        public int? MmrBefore { get; set; }
        public int? MmrAfter { get; set; }
        public int? DurationSeconds { get; set; }
        public string HdtVersion { get; set; } = "";
        public string PluginVersion { get; set; } = "0.1.0";
        public string RawJsonPath { get; set; } = "";
        public List<TurnSnapshot> Turns { get; set; } = new List<TurnSnapshot>();
        public List<PurchaseEvent> Purchases { get; set; } = new List<PurchaseEvent>();
        public List<UpgradeEvent> Upgrades { get; set; } = new List<UpgradeEvent>();
        public List<CombatResult> Combats { get; set; } = new List<CombatResult>();
        public List<TrinketChoice> Trinkets { get; set; } = new List<TrinketChoice>();
    }
}
