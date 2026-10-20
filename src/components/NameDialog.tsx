import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import { ActionButton } from './ActionButton';

type Props = {
  visible: boolean;
  title: string;
  /** Pre-filled name; already the date and time stamp by default. */
  initialValue: string;
  footnote?: string;
  confirmLabel: string;
  /** Optional second action, e.g. "Save & Share". */
  secondaryLabel?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
  onSecondary?: (name: string) => void;
};

/**
 * Prompts for a recording's name. Shown after recording (so the file is already
 * saved under the default name) and when renaming from the library.
 */
export function NameDialog({
  visible,
  title,
  initialValue,
  footnote,
  confirmLabel,
  secondaryLabel,
  onCancel,
  onConfirm,
  onSecondary,
}: Props) {
  const [value, setValue] = useState(initialValue);

  // Reset to the suggested name each time the dialog opens.
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
          pointerEvents="box-none"
        >
          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>

            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder="Recording name"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={() => onConfirm(value)}
              accessibilityLabel="Recording name"
            />

            {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}

            <View style={styles.actions}>
              <ActionButton label="Cancel" onPress={onCancel} style={styles.action} />
              <ActionButton
                label={confirmLabel}
                variant="primary"
                onPress={() => onConfirm(value)}
                style={styles.action}
              />
            </View>

            {secondaryLabel && onSecondary ? (
              <ActionButton
                label={secondaryLabel}
                onPress={() => onSecondary(value)}
                style={styles.secondary}
              />
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: colors.scrim,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 13,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  action: {
    flex: 1,
  },
  secondary: {
    marginTop: spacing.md,
  },
});
