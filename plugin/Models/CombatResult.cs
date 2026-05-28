using System.Collections.Generic;

namespace HDTBgTracker.Models
{
    public sealed class CombatResult
    {
        public int TurnNumber { get; set; }
        public string OpponentHeroId { get; set; } = "";
        public List<BoardMinion> OpponentBoard { get; set; } = new List<BoardMinion>();
        public string Result { get; set; } = "tie";
        public int? DamageDealt { get; set; }
        public int? DamageTaken { get; set; }
    }
}

