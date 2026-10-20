import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

export type SegmentOption<T extends string | number> = {
  value: T;
  label: string;
};

type Props<T extends string | number> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessibility label describing the group. */
  label: string;
};

/** A row of mutually exclusive choices, styled as one control. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: Props<T>) {
  return (
    <View style={styles.container} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.accent,
  },
  segmentPressed: {
    backgroundColor: colors.border,
  },
  label: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  labelSelected: {
    color: '#FFFFFF',
  },
});
