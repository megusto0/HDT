using System.Collections.Generic;

namespace HDTBgTracker.Models
{
    public sealed class TurnSnapshot
    {
        public int TurnNumber { get; set; }
        public int TavernTier { get; set; }
        public int Gold { get; set; }
        public int Health { get; set; }
        public int? TripleProgress { get; set; }
        public int? HandSize { get; set; }
        public List<BoardMinion> BoardMinions { get; set; } = new List<BoardMinion>();
        public List<BoardMinion> ShopMinions { get; set; } = new List<BoardMinion>();
    }
}

