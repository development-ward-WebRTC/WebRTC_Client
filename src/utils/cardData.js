export const CARD_DATABASE = {
  creatures: [
    // 1코스트 크리처
    {
      id: "creature_001",
      name: "숲의 정찰병",
      type: "creature",
      cost: 1,
      attack: 1,
      health: 2,
      image: "🌿",
    },
    {
      id: "creature_002",
      name: "용감한 기사",
      type: "creature",
      cost: 1,
      attack: 2,
      health: 1,
      image: "⚔️",
    },

    // 2코스트 크리처
    {
      id: "creature_003",
      name: "숲의 궁수",
      type: "creature",
      cost: 2,
      attack: 2,
      health: 2,
      image: "🏹",
    },
    {
      id: "creature_004",
      name: "마법사 견습생",
      type: "creature",
      cost: 2,
      attack: 1,
      health: 3,
      image: "🧙",
    },
    {
      id: "creature_005",
      name: "늑대",
      type: "creature",
      cost: 2,
      attack: 3,
      health: 1,
      image: "🐺",
    },

    // 3코스트 크리처
    {
      id: "creature_006",
      name: "숲의 정령",
      type: "creature",
      cost: 3,
      attack: 3,
      health: 3,
      image: "🧚",
    },
    {
      id: "creature_007",
      name: "드래곤 새끼",
      type: "creature",
      cost: 3,
      attack: 4,
      health: 2,
      image: "🐉",
    },
    {
      id: "creature_008",
      name: "전투 마법사",
      type: "creature",
      cost: 3,
      attack: 2,
      health: 4,
      image: "🔮",
    },

    // 4코스트 크리처
    {
      id: "creature_009",
      name: "정예 기사",
      type: "creature",
      cost: 4,
      attack: 4,
      health: 4,
      image: "🛡️",
    },
    {
      id: "creature_010",
      name: "화염 정령",
      type: "creature",
      cost: 4,
      attack: 5,
      health: 3,
      image: "🔥",
    },

    // 5코스트+ 크리처
    {
      id: "creature_011",
      name: "고대 드래곤",
      type: "creature",
      cost: 5,
      attack: 5,
      health: 5,
      image: "🐲",
    },
    {
      id: "creature_012",
      name: "거대 골렘",
      type: "creature",
      cost: 6,
      attack: 6,
      health: 6,
      image: "🗿",
    },
    {
      id: "creature_013",
      name: "얼음 거인",
      type: "creature",
      cost: 7,
      attack: 7,
      health: 7,
      image: "❄️",
    },
  ],

  spells: [
    // 데미지 주문
    {
      id: "spell_001",
      name: "화염구",
      type: "spell",
      cost: 2,
      effect: "deal_damage",
      target: "creature",
      value: 3,
      image: "🔥",
      description: "크리처에게 3 데미지",
    },
    {
      id: "spell_002",
      name: "번개",
      type: "spell",
      cost: 1,
      effect: "deal_damage",
      target: "creature",
      value: 2,
      image: "⚡",
      description: "크리처에게 2 데미지",
    },
    {
      id: "spell_003",
      name: "화염 폭풍",
      type: "spell",
      cost: 4,
      effect: "deal_damage",
      target: "player",
      value: 5,
      image: "💥",
      description: "플레이어에게 5 데미지",
    },

    // 드로우 주문
    {
      id: "spell_004",
      name: "지혜의 서",
      type: "spell",
      cost: 2,
      effect: "draw_cards",
      value: 2,
      image: "📖",
      description: "카드 2장 뽑기",
    },
    {
      id: "spell_005",
      name: "마법의 통찰",
      type: "spell",
      cost: 3,
      effect: "draw_cards",
      value: 3,
      image: "✨",
      description: "카드 3장 뽑기",
    },

    // 회복 주문
    {
      id: "spell_006",
      name: "치유",
      type: "spell",
      cost: 2,
      effect: "heal",
      value: 5,
      image: "💚",
      description: "체력 5 회복",
    },
    {
      id: "spell_007",
      name: "신성한 빛",
      type: "spell",
      cost: 3,
      effect: "heal",
      value: 8,
      image: "✝️",
      description: "체력 8 회복",
    },
  ],
};

// 카드 ID로 카드 정보 가져오기
export const getCardById = (cardId) => {
  const allCards = [...CARD_DATABASE.creatures, ...CARD_DATABASE.spells];
  return allCards.find((card) => card.id === cardId);
};

// 비용별 카드 필터링
export const getCardsByCost = (cost) => {
  const allCards = [...CARD_DATABASE.creatures, ...CARD_DATABASE.spells];
  return allCards.filter((card) => card.cost === cost);
};

// 타입별 카드 필터링
export const getCardsByType = (type) => {
  return CARD_DATABASE[type === "creature" ? "creatures" : "spells"];
};
