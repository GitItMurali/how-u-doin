// Phase 0 stub — Create task modal (bottom sheet)
// Implemented in Phase 3
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';

export default function CreateTaskModal() {
  return (
    <View style={styles.container}>
      <Text>Create Task — Phase 3</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});
