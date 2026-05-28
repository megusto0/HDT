namespace HDTBgTracker.Models
{
    public sealed class TrinketChoice
    {
        public int TurnNumber { get; set; }
        public string Slot { get; set; } = "unknown";
        public string? SelectedCardId { get; set; }
        public string? SelectedName { get; set; }
        public string? OfferedJson { get; set; }
        public string Source { get; set; } = "entity-scan";
    }
}
