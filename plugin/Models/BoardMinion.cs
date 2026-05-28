namespace HDTBgTracker.Models
{
    public sealed class BoardMinion
    {
        public string CardId { get; set; } = "";
        public string Name { get; set; } = "";
        public int Tier { get; set; }
        public int Attack { get; set; }
        public int Health { get; set; }
        public string Tribe { get; set; } = "";
        public bool Taunt { get; set; }
        public bool DivineShield { get; set; }
    }
}

