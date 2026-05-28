namespace HDTBgTracker.Models
{
    public sealed class PurchaseEvent
    {
        public int TurnNumber { get; set; }
        public string CardId { get; set; } = "";
        public string CardName { get; set; } = "";
        public int Tier { get; set; }
        public int GoldPaid { get; set; } = 3;
        public string Source { get; set; } = "shop";
    }
}

