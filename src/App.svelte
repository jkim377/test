<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Phaser from 'phaser';

  type Block = 'Afternoon' | 'Evening';
  type PlayerAction = 'wait' | 'cook';

  type BlockRecord = {
    block: Block;
    playerAction: PlayerAction;
    hadHomeMeal: boolean;
    hadDeliveryMeal: boolean;
    hadSnack: boolean;
  };

  type DayRecord = {
    day: number;
    blocks: BlockRecord[];
  };

  let day = 1;                    // 며칠째인지
  let block: Block = 'Afternoon'; // 오후 / 저녁
  let hungerDebt = 0;
  let mealRhythm = 0;             // 0~7
  let moneySpent = 0;             // 누적 지출 G

  // 일일 기록 플래그
  let hadHomeMealToday = false;      // 오늘 집밥 여부(한 번이라도)
  let hadDeliveryMealToday = false;  // 오늘 배달식사 여부(한 번이라도)

  // 날짜 변경 이펙트용 플래그
  let justChangedDay = false;

  // 직전 시간대 N의 배달 정보
  let lastDeliveryType: 'none' | 'meal' | 'snack' = 'none';

  // 도표용 히스토리 (마지막 14일)
  let history: DayRecord[] = [];
  const BLOCKS: Block[] = ['Afternoon', 'Evening'];

  // 표시용 텍스트
  $: lastDeliveryText =
    lastDeliveryType === 'meal'
      ? '이전 시간: 식사 배달 (3G)'
      : lastDeliveryType === 'snack'
      ? '이전 시간: 간식 배달 (1G)'
      : '이전 시간: 배달 없음';

  let log: string[] = [];

  // ★ 로그는 항상 최근 8줄만 유지
  function appendLog(entry: string) {
    log = [entry, ...log].slice(0, 8);
  }

  function getBlockRecord(dayRec: DayRecord, blk: Block): BlockRecord | null {
    return dayRec.blocks.find((b) => b.block === blk) ?? null;
  }

  function updateHistory(
    dayNum: number,
    blk: Block,
    action: PlayerAction,
    hadHomeMeal: boolean,
    hadDeliveryMeal: boolean,
    hadSnack: boolean
  ) {
    const newBlock: BlockRecord = {
      block: blk,
      playerAction: action,
      hadHomeMeal,
      hadDeliveryMeal,
      hadSnack
    };

    const existingIndex = history.findIndex((d) => d.day === dayNum);

    if (existingIndex === -1) {
      const newDay: DayRecord = { day: dayNum, blocks: [newBlock] };
      history = [...history, newDay].slice(-10);
    } else {
      const existingDay = history[existingIndex];
      const filteredBlocks = existingDay.blocks.filter((b) => b.block !== blk);
      const updatedDay: DayRecord = {
        ...existingDay,
        blocks: [...filteredBlocks, newBlock]
      };
      const newHistory = [...history];
      newHistory[existingIndex] = updatedDay;
      newHistory.sort((a, b) => a.day - b.day);
      history = newHistory.slice(-10);
    }
  }

  // --------- N의 자동 배달 로직 ---------

  // 식사 배달(3G) 여부
  function shouldOrderMeal(currentMealRhythm: number, currentHungerDebt: number): boolean {
    if (currentHungerDebt <= 0) return false;

    if (currentMealRhythm === 0) {
      if (currentHungerDebt === 1) {
        // 60% 확률
        return Math.random() < 0.6;
      }
      // hungerDebt >= 2 → 100%
      return true;
    }

    if (currentMealRhythm >= 1 && currentMealRhythm <= 4) {
      return currentHungerDebt >= 2;
    }

    // mealRhythm 5~7 → 조건을 3→4로 상향
    return currentHungerDebt >= 4;
  }

  // 간식 배달(1G) 여부
  function shouldOrderSnack(currentMealRhythm: number, currentHungerDebt: number): boolean {
    if (currentHungerDebt <= 0) return false;

    if (currentMealRhythm <= 1) {
      // 0~1
      return currentHungerDebt >= 1;
    } else if (currentMealRhythm <= 5) {
      // 2~5
      return currentHungerDebt >= 2;
    } else {
      // 6~7
      return currentHungerDebt >= 3;
    }
  }

  // --------- 한 블록(오후/저녁) 진행 ---------

  function nextBlock(action: PlayerAction) {
    const blockLabelKo = block === 'Afternoon' ? '오후' : '저녁';

    let hadHomeMeal = action === 'cook';
    let hadDeliveryMeal = false;
    let hadSnack = false;

    if (hadHomeMeal) {
      hadHomeMealToday = true;
    }

    // 1) 집밥/배달 식사가 없으면 hungerDebt +1
    if (!hadHomeMeal) {
      hungerDebt += 1;
    }

    const hungerBeforeDelivery = hungerDebt;
    const isHighRhythm = mealRhythm >= 5;

    // 2) N의 배달/간식 로직
    if (isHighRhythm) {
      // 리듬 5 이상: 간식을 우선적으로 시도
      if (!hadHomeMeal) {
        // 간식 → 식사 순서
        if (shouldOrderSnack(mealRhythm, hungerDebt)) {
          hadSnack = true;
          moneySpent += 1;
          // 리듬 5 이상에서는 간식도 debt을 2 감소
          hungerDebt = Math.max(hungerDebt - 2, 0);
        } else if (shouldOrderMeal(mealRhythm, hungerDebt)) {
          hadDeliveryMeal = true;
          hadDeliveryMealToday = true;
          hungerDebt = 0; // 배달 식사 시 hungerDebt 리셋
          moneySpent += 3;
        }
      }
    } else {
      // 리듬 0~4: 기존처럼 식사 배달 우선, 그다음 간식
      if (shouldOrderMeal(mealRhythm, hungerDebt)) {
        hadDeliveryMeal = true;
        hadDeliveryMealToday = true;
        hungerDebt = 0;
        moneySpent += 3;
      } else if (!hadHomeMeal) {
        if (shouldOrderSnack(mealRhythm, hungerDebt)) {
          hadSnack = true;
          moneySpent += 1;
          // 이 구간에서는 간식이 debt에 영향 없음
        }
      }
    }

    const hungerAfterBlock = hungerDebt;

    // 도표용 히스토리 업데이트
    updateHistory(day, block, action, hadHomeMeal, hadDeliveryMeal, hadSnack);

    const playerActionLabel = action === 'cook' ? '요리(집밥)' : '시간 경과';
    const mealResultLabel =
      hadHomeMeal
        ? '집밥'
        : hadDeliveryMeal
        ? '배달 식사(3G)'
        : hadSnack
        ? '간식(1G)'
        : '식사/간식 없음';

    // 직전 시간대 배달 정보 기록
    if (hadDeliveryMeal) {
      lastDeliveryType = 'meal';
    } else if (hadSnack) {
      lastDeliveryType = 'snack';
    } else {
      lastDeliveryType = 'none';
    }

    appendLog(
      `Day ${day} ${blockLabelKo} — 행동: ${playerActionLabel} / 결과: ${mealResultLabel}, hungerDebt ${hungerBeforeDelivery}→${hungerAfterBlock}, mealRhythm ${mealRhythm}, 누적 지출 ${moneySpent}G`
    );

    // --------- 블록 전환 / 하루 종료 ---------

    if (block === 'Afternoon') {
      // 오후 → 저녁
      block = 'Evening';
    } else {
      // 저녁 → 하루 종료 → 다음 날 오후
      const prev = mealRhythm;
      let summary: string;

      if (hadHomeMealToday) {
        // 집밥이 하루에 최소 한 번이라도 있으면 증가
        mealRhythm = Math.min(mealRhythm + 1, 7);
        summary = `집밥 있는 날 — mealRhythm ${prev}→${mealRhythm}`;
      } else if (hadDeliveryMealToday) {
        // 집밥은 없고 배달만 먹은 날
        mealRhythm = Math.max(mealRhythm - 3, 0);
        summary = `배달만 먹은 날 — mealRhythm ${prev}→${mealRhythm}`;
      } else {
        // 아무것도 안 먹은 날
        mealRhythm = Math.max(mealRhythm - 3, 0);
        summary = `아무것도 안 먹은 날 — mealRhythm ${prev}→${mealRhythm}`;
      }

      appendLog(`Day ${day} 종료 — ${summary}`);

      // 날짜 넘어가기
      day += 1;
      block = 'Afternoon';
      hadHomeMealToday = false;
      hadDeliveryMealToday = false;

      // 날짜 변경 이펙트 (중앙 time panel flash)
      justChangedDay = false;
      setTimeout(() => {
        justChangedDay = true;
        setTimeout(() => {
          justChangedDay = false;
        }, 900);
      }, 0);
    }
  }

  // --------- Phaser (장식용) ---------
  let phaserContainer: HTMLDivElement;
  let game: Phaser.Game | null = null;

  onMount(() => {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 480,
      height: 180,
      parent: phaserContainer,
      backgroundColor: '#181824',
      scene: {
        create(this: Phaser.Scene) {
          this.add.text(
            16,
            16,
            'HKM Meal Rhythm / HungerDebt Sim',
            {
              fontFamily: 'sans-serif',
              fontSize: '18px',
              color: '#ffffff'
            }
          );
        }
      }
    };

    game = new Phaser.Game(config);
  });

  onDestroy(() => {
    if (game) {
      game.destroy(true);
      game = null;
    }
  });
</script>

<style>
  .root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 12px;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #101018;
    color: #e0e0f0;
  }

  /* 상단: 상태 패널 (날짜/시간 제외) */
  .top-panel {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .top-panel > div {
    padding: 4px 8px;
    background: #1a1a28;
    border-radius: 6px;
  }

  /* 중앙부: 날짜/시간 표시 + 이펙트 */
  .time-panel {
    align-self: center;
    margin-bottom: 8px;
    padding: 6px 16px;
    border-radius: 999px;
    background: #1b1b2a;
    border: 1px solid #30304a;
    font-size: 14px;
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  .time-panel.flash {
    animation: dayFlash 800ms ease-out;
  }

  .time-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #8de2ff;
  }

  @keyframes dayFlash {
    0% {
      transform: scale(0.9);
      background: #f0e07a;
      color: #101018;
      box-shadow: 0 0 0 0 rgba(240, 224, 122, 0.8);
    }
    100% {
      transform: scale(1);
      background: #1b1b2a;
      color: #e0e0f0;
      box-shadow: 0 0 0 16px rgba(240, 224, 122, 0);
    }
  }

  .middle {
    display: flex;
    gap: 16px;
    margin-bottom: 8px;
  }

  .phaser-wrapper {
    position: relative;
    flex: 1 1 auto;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #2a2a3a;
  }

  .phaser-canvas {
    width: 100%;
    height: 100%;
  }

  .last-delivery-chip {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(10, 10, 18, 0.85);
    border: 1px solid #3a3a4e;
    font-size: 12px;
    backdrop-filter: blur(4px);
    pointer-events: none; /* 클릭이 Phaser 캔버스로 통과되도록 */
  }

  .controls {
    flex: 0 0 180px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
  }

  button {
    padding: 10px 12px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    background: #2b2b3c;
    color: #f0f0ff;
    font-size: 14px;
  }

  button:hover {
    background: #3a3a4e;
  }

  /* 도표 영역 */
  .history-chart {
    margin-top: 4px;
    margin-bottom: 4px;
    padding: 8px;
    border-radius: 8px;
    background: #181826;
    border: 1px solid #2a2a3a;
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }

  .history-empty {
    font-size: 12px;
    color: #9090b0;
  }

  .day-column {
    min-width: 80px;
    padding: 4px 6px;
    border-radius: 6px;
    background: #1f1f2c;
    flex: 0 0 auto;
  }

  .day-label {
    font-size: 12px;
    margin-bottom: 4px;
    text-align: center;
    color: #b0b0d0;
  }

  .day-blocks {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .block-cell {
    border-radius: 6px;
    padding: 4px;
    background: #151522;
    border: 1px solid #2a2a3a;
  }

  .block-label {
    font-size: 11px;
    margin-bottom: 2px;
    color: #a0a0c0;
  }

  .block-shapes {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .shape {
    display: inline-block;
  }

  .shape.home {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: #7ad0ff; /* 집밥: 파란 네모 */
  }

  .shape.delivery {
    width: 0;
    height: 0;
    border-left: 10px solid #ffd27f; /* 식사 배달: 노란 삼각형 */
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }

  .shape.snack {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 2px solid #ff79c6; /* 간식: 분홍 동그라미 */
  }

  .shape.none {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px dashed #555; /* 아무것도 없음: 점선 동그라미 */
  }

  .log-container {
    flex: 1 1 auto;
    margin-top: 4px;
    padding: 8px;
    border-radius: 8px;
    background: #151520;
    border: 1px solid #2a2a3a;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.4;
  }

  .log-line {
    margin-bottom: 4px;
    white-space: pre-wrap;
  }
</style>

<div class="root">
  <!-- 상단: 수치 상태 (날짜/시간 제외) -->
  <div class="top-panel">
    <div>mealRhythm: {mealRhythm}</div>
    <div>hungerDebt: {hungerDebt}</div>
    <div>누적 지출: {moneySpent}G</div>
  </div>

  <!-- 중앙: 날짜/시간 + 이펙트 -->
  <div class="time-panel" class:flash={justChangedDay}>
    <span class="time-dot" />
    <span>Day {day}</span>
    <span>· {block === 'Afternoon' ? '오후' : '저녁'}</span>
  </div>

  <!-- 중앙: Phaser 캔버스 + 버튼 -->
  <div class="middle">
    <div class="phaser-wrapper">
      <!-- 오른쪽 위 오버레이: 직전 시간 배달 정보 -->
      <div class="last-delivery-chip">
        {lastDeliveryText}
      </div>

      <!-- Phaser가 붙을 실제 캔버스 컨테이너 -->
      <div class="phaser-canvas" bind:this={phaserContainer}></div>
    </div>

    <div class="controls">
      <button on:click={() => nextBlock('wait')}>시간 경과</button>
      <button on:click={() => nextBlock('cook')}>요리 (집밥)</button>
    </div>
  </div>

  <!-- 도형 기반 도표 -->
  <div class="history-chart">
    {#if history.length === 0}
      <div class="history-empty">아직 기록 없음</div>
    {:else}
      {#each history as dayRec}
        <div class="day-column">
          <div class="day-label">Day {dayRec.day}</div>
          <div class="day-blocks">
            {#each BLOCKS as blk}
              {@const record = getBlockRecord(dayRec, blk)}
              <div class="block-cell">
                <div class="block-label">{blk === 'Afternoon' ? '오후' : '저녁'}</div>
                <div class="block-shapes">
                  {#if record}
                    {#if record.hadHomeMeal}
                      <div class="shape home" title="집밥"></div>
                    {/if}
                    {#if record.hadDeliveryMeal}
                      <div class="shape delivery" title="식사 배달"></div>
                    {/if}
                    {#if record.hadSnack}
                      <div class="shape snack" title="간식 배달"></div>
                    {/if}
                    {#if !record.hadHomeMeal && !record.hadDeliveryMeal && !record.hadSnack}
                      <div class="shape none" title="아무것도 없음"></div>
                    {/if}
                  {:else}
                    <div class="shape none" title="아직 없음"></div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- 하단: 텍스트 로그 (최신 8줄) -->
  <div class="log-container">
    {#each log as line}
      <div class="log-line">{line}</div>
    {/each}
  </div>
</div>
