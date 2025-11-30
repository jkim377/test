<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Phaser from 'phaser';

  let container: HTMLDivElement;
  let game: Phaser.Game | null = null;

  onMount(() => {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 480,
      height: 270,
      parent: container,
      backgroundColor: '#181824',
      scene: {
        create(this: Phaser.Scene) {
          this.add.text(20, 20, 'Phaser + Svelte + Vite', {
            fontFamily: 'sans-serif',
            fontSize: '20px',
            color: '#ffffff'
          });
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
  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #101018;
    color: #e0e0f0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
</style>

<main>
  <div bind:this={container}></div>
</main>
