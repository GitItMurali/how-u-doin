// Phase 0 stub — Edit task modal
// Implemented in Phase 3
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';

export default function EditTaskModal() {
  return (
    <View style={styles.container}>
      <Text>Edit Task — Phase 3</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});
