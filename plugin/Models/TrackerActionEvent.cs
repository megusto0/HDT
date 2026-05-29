using System;

namespace HDTBgTracker.Models
{
    public sealed class TrackerActionEvent
    {
        public int TurnNumber { get; set; }
        public string EventType { get; set; } = "";
        public string CardId { get; set; } = "";
        public string CardName { get; set; } = "";
        public int? EntityId { get; set; }
        public string TargetCardId { get; set; } = "";
        public string TargetName { get; set; } = "";
        public int? TargetEntityId { get; set; }
        public string Source { get; set; } = "";
        public string RawJson { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string DedupKey =>
            $"{EventType}:{TurnNumber}:{EntityId}:{CardId}:{TargetEntityId}:{TargetCardId}:{Source}";
    }
}
