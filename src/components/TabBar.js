import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors, space } from '../theme';

export const TABS = [
  ['chat', 'Chat'],
  ['research', 'Research'],
  ['reply', 'Reply'],
  ['tasks', 'Tasks'],
  ['memory', 'Memory'],
];

export default function TabBar({ active, onSelect }) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {TABS.map(([id, label]) => {
        const on = id === active;
        return (
          <Pressable
            key={id}
            onPress={() => onSelect(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            style={styles.tab}
          >
            <View style={[styles.dot, on && styles.dotOn]} />
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  dot: { width: 20, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.accent },
  text: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  textOn: { color: colors.text },
});
