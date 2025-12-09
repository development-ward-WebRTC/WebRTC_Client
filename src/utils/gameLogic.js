// 액션 유효성 검증
export const validateAction = (gameState, action, playerId) => {
  if (!gameState) {
    return { valid: false, error: "게임이 초기화되지 않았습니다" };
  }

  const player = gameState[playerId];
  const isMyTurn = gameState.currentPlayer === playerId;

  switch (action.type) {
    case "DRAW_CARD":
      if (!isMyTurn) {
        return { valid: false, error: "당신의 턴이 아닙니다" };
      }
      if (gameState.phase !== "draw") {
        return { valid: false, error: "드로우 페이즈가 아닙니다" };
      }
      if (player.deck.length === 0) {
        return { valid: false, error: "덱에 카드가 없습니다" };
      }
      return { valid: true };

    case "PLAY_CREATURE": {
      if (!isMyTurn) {
        return { valid: false, error: "당신의 턴이 아닙니다" };
      }
      if (gameState.phase !== "main") {
        return { valid: false, error: "메인 페이즈가 아닙니다" };
      }

      const creatureCard = player.hand[action.cardIndex];
      if (!creatureCard) {
        return { valid: false, error: "손패에 해당 카드가 없습니다" };
      }
      if (creatureCard.cost > player.mana) {
        return { valid: false, error: `마나가 부족합니다 (필요: ${creatureCard.cost}, 현재: ${player.mana})` };
      }
      if (player.field[action.slot] !== null) {
        return { valid: false, error: "해당 슬롯이 이미 사용중입니다" };
      }
      return { valid: true };
    }

    case "PLAY_SPELL": {
      if (!isMyTurn) {
        return { valid: false, error: "당신의 턴이 아닙니다" };
      }
      if (gameState.phase !== "main") {
        return { valid: false, error: "메인 페이즈가 아닙니다" };
      }

      const spellCard = player.hand[action.cardIndex];
      if (!spellCard) {
        return { valid: false, error: "손패에 해당 카드가 없습니다" };
      }
      if (spellCard.cost > player.mana) {
        return { valid: false, error: `마나가 부족합니다 (필요: ${spellCard.cost}, 현재: ${player.mana})` };
      }
      return { valid: true };
    }

    case "ATTACK": {
      if (!isMyTurn) {
        return { valid: false, error: "당신의 턴이 아닙니다" };
      }
      if (gameState.phase !== "combat") {
        return { valid: false, error: "전투 페이즈가 아닙니다" };
      }

      const attacker = player.field[action.attackerSlot];
      if (!attacker) {
        return { valid: false, error: "공격할 크리처가 없습니다" };
      }
      if (player.attackedThisTurn.includes(action.attackerSlot)) {
        return { valid: false, error: "이미 공격한 크리처입니다" };
      }
      return { valid: true };
    }

    case "PHASE_CHANGE": {
      if (!isMyTurn) {
        return { valid: false, error: "당신의 턴이 아닙니다" };
      }
      return { valid: true };
    }

    case "END_TURN": {
      if (!isMyTurn) {
        return { valid: false, error: "당신의 턴이 아닙니다" };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: "알 수 없는 액션입니다" };
  }
};

// 액션 적용 (새로운 상태 반환)
export const applyAction = (gameState, action) => {
  const newState = JSON.parse(JSON.stringify(gameState)); // Deep copy
  const player = newState[action.player];
  const opponentId = action.player === "player1" ? "player2" : "player1";
  const opponent = newState[opponentId];

  switch (action.type) {
    case "DRAW_CARD":
      // 덱에서 카드 1장 뽑기
      if (player.deck.length > 0) {
        const drawnCard = player.deck.shift();
        player.hand.push(drawnCard);
      }
      // 페이즈 전환
      newState.phase = "main";
      break;

    case "PLAY_CREATURE": {
      // 손패에서 카드 제거
      const creatureCard = player.hand.splice(action.cardIndex, 1)[0];
      // 필드에 배치
      player.field[action.slot] = {
        ...creatureCard,
        currentHealth: creatureCard.health,
        instanceId: `${action.player}_${Date.now()}_${action.slot}`,
      };
      // 마나 소모
      player.mana -= creatureCard.cost;
      break;
    }

    case "PLAY_SPELL": {
      // 손패에서 카드 제거
      const spellCard = player.hand.splice(action.cardIndex, 1)[0];

      // 주문 효과 적용
      applySpellEffect(newState, spellCard, action.player, action.targetSlot);

      // 묘지로 이동
      player.graveyard.push(spellCard);
      // 마나 소모
      player.mana -= spellCard.cost;
      break;
    }

    case "ATTACK": {
      const attacker = player.field[action.attackerSlot];

      if (action.defenderSlot !== null && action.defenderSlot !== undefined) {
        // 크리처 공격
        const defender = opponent.field[action.defenderSlot];
        if (defender) {
          // 전투 해결
          defender.currentHealth -= attacker.attack;
          attacker.currentHealth -= defender.attack;

          // 파괴된 크리처 처리
          if (defender.currentHealth <= 0) {
            opponent.graveyard.push(opponent.field[action.defenderSlot]);
            opponent.field[action.defenderSlot] = null;
          }
          if (attacker.currentHealth <= 0) {
            player.graveyard.push(player.field[action.attackerSlot]);
            player.field[action.attackerSlot] = null;
          }
        }
      } else {
        // 플레이어 직접 공격
        opponent.health -= attacker.attack;

        // 승리 조건 확인
        if (opponent.health <= 0) {
          newState.winner = action.player;
        }
      }

      // 공격 표시
      player.attackedThisTurn.push(action.attackerSlot);
      break;
    }

    case "PHASE_CHANGE": {
      newState.phase = action.phase;
      break;
    }

    case "END_TURN": {
      // 턴 교체
      newState.currentPlayer = opponentId;
      newState.turn += 1;
      newState.phase = "draw";

      // 공격 기록 초기화
      player.attackedThisTurn = [];

      // 마나 회복 및 증가 (상대방)
      if (opponent.maxMana < 10) {
        opponent.maxMana += 1;
      }
      opponent.mana = opponent.maxMana;
      break;
    }
  }

  return newState;
};

// 주문 효과 적용
const applySpellEffect = (gameState, spellCard, casterId, targetSlot) => {
  const opponentId = casterId === "player1" ? "player2" : "player1";
  const opponent = gameState[opponentId];

  switch (spellCard.effect) {
    case "deal_damage":
      if (spellCard.target === "creature" && targetSlot !== null) {
        const target = opponent.field[targetSlot];
        if (target) {
          target.currentHealth -= spellCard.value;
          if (target.currentHealth <= 0) {
            opponent.graveyard.push(opponent.field[targetSlot]);
            opponent.field[targetSlot] = null;
          }
        }
      } else if (spellCard.target === "player") {
        opponent.health -= spellCard.value;
        if (opponent.health <= 0) {
          gameState.winner = casterId;
        }
      }
      break;

    case "heal":
      gameState[casterId].health += spellCard.value;
      if (gameState[casterId].health > 20) {
        gameState[casterId].health = 20;
      }
      break;

    case "draw_cards": {
      const caster = gameState[casterId];
      for (let i = 0; i < spellCard.value; i++) {
        if (caster.deck.length > 0) {
          const card = caster.deck.shift();
          caster.hand.push(card);
        }
      }
      break;
    }

    default:
      console.warn("Unknown spell effect:", spellCard.effect);
  }
};
