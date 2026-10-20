import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

const BAR_COUNT = 30;

type Props = {
  /** Input amplitude, 0..1. */
  level: number;
  /** Dim the meter when nothing is being captured. */
  idle?: boolean;
};

/** A segmented bar meter showing how much signal the microphone is picking up. */
export function LevelMeter({ level, idle = false }: Props) {
  // A square-root curve makes quiet speech visible instead of hugging zero.
  const filled = idle ? 0 : Math.round(Math.sqrt(clamp01(level)) * BAR_COUNT);

  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel="Input level">
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            { backgroundColor: barColor(index, index < filled, idle) },
          ]}
        />
      ))}
    </View>
  );
}

function barColor(index: number, active: boolean, idle: boolean): string {
  if (!active) return idle ? colors.surfaceRaised : colors.border;
  if (index >= BAR_COUNT - 3) return colors.danger;
  if (index >= BAR_COUNT - 8) return '#FFC24B';
  return colors.success;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 3,
  },
  bar: {
    flex: 1,
    height: 8,
    borderRadius: radius.sm,
  },
});
