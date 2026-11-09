import React from 'react';
import { View, Text, FlatList, Pressable, Alert, StyleSheet } from 'react-native';
import Button from '../components/Button';
import { colors, space, radius } from '../theme';

function when(ts) {
  return new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function HistoryScreen({ chats, onOpen, onDelete, onDeleteAll, onBack }) {
  function confirmDelete(chat) {
    Alert.alert('Delete chat?', `"${chat.title}" will be removed from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(chat.id) },
    ]);
  }
  function confirmDeleteAll() {
    Alert.alert('Delete all chats?', 'Every saved conversation will be removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: onDeleteAll },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <View style={styles.headerButtons}>
          <Button label="Back" variant="secondary" onPress={onBack} />
          {chats.length > 0 && <Button label="Delete all" variant="danger" onPress={confirmDeleteAll} />}
        </View>
      </View>
      {chats.length === 0 ? (
        <Text style={styles.empty}>No saved chats yet. Start one and it will appear here.</Text>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Pressable
                style={styles.itemMain}
                onPress={() => onOpen(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open chat ${item.title}`}
              >
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemMeta}>{item.messages.length} messages · {when(item.updatedAt)}</Text>
              </Pressable>
              <Button label="Delete" variant="danger" onPress={() => confirmDelete(item)} accessibilityLabel={`Delete chat ${item.title}`} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { padding: space.lg, gap: space.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  headerButtons: { flexDirection: 'row', gap: space.sm },
  empty: { color: colors.muted, fontSize: 15, padding: space.lg, lineHeight: 22 },
  list: { padding: space.lg, gap: space.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md },
  itemMain: { flex: 1, minHeight: 44, justifyContent: 'center' },
  itemTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  itemMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
