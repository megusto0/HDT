namespace HDTBgTracker.Models
{
    public sealed class UpgradeEvent
    {
        public int TurnNumber { get; set; }
        public int FromTier { get; set; }
        public int ToTier { get; set; }
        public int GoldPaid { get; set; }
    }
}

