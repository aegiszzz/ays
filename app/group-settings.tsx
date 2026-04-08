import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Edit2, Check, X, UserPlus, Trash2, Crown } from 'lucide-react-native';

interface Member {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

export default function GroupSettingsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { groupId, groupName: initialGroupName } = useLocalSearchParams();

  const [groupName, setGroupName] = useState(initialGroupName as string);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(initialGroupName as string);
  const [members, setMembers] = useState<Member[]>([]);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [addingMembers, setAddingMembers] = useState(false);

  const isAdmin = user?.id === createdBy;

  useEffect(() => {
    if (user && groupId) {
      fetchGroupDetails();
    }
  }, [user, groupId]);

  const fetchGroupDetails = async () => {
    try {
      const { data: groupData } = await supabase
        .from('groups')
        .select('created_by')
        .eq('id', groupId)
        .single();

      if (groupData) setCreatedBy(groupData.created_by);

      const { data: membersData } = await supabase
        .from('group_members')
        .select('user_id, users(id, username, avatar_url)')
        .eq('group_id', groupId);

      if (membersData) {
        setMembers(membersData.map((m: any) => m.users).filter(Boolean));
      }
    } catch (err) {
      console.error('Error fetching group details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim() || newName.trim() === groupName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase.rpc('update_group_name', {
        p_group_id: groupId,
        p_name: newName.trim(),
      });
      if (error) throw error;
      setGroupName(newName.trim());
      setEditingName(false);
    } catch (err) {
      const msg = 'Failed to update group name';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    } finally {
      setSavingName(false);
    }
  };

  const handleRemoveMember = (memberId: string, memberUsername: string) => {
    if (memberId === user?.id) return;
    const msg = `Remove ${memberUsername} from the group?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) performRemove(memberId);
    } else {
      Alert.alert('Remove Member', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => performRemove(memberId) },
      ]);
    }
  };

  const performRemove = async (memberId: string) => {
    try {
      const { error } = await supabase.rpc('remove_group_member', {
        p_group_id: groupId,
        p_user_id: memberId,
      });
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      const msg = 'Failed to remove member';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    }
  };

  const openAddMembers = async () => {
    setShowAddModal(true);
    setLoadingFriends(true);
    try {
      const { data } = await supabase
        .from('friends')
        .select('friend_id, users!friends_friend_id_fkey(id, username, avatar_url)')
        .eq('user_id', user!.id)
        .eq('status', 'accepted');

      const memberIds = new Set(members.map((m) => m.id));
      const friendsList = (data || [])
        .map((f: any) => f.users)
        .filter((f: any) => f && !memberIds.has(f.id));

      setFriends(friendsList);
    } catch (err) {
      console.error('Error fetching friends:', err);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedFriends.size === 0) return;
    setAddingMembers(true);
    try {
      const { error } = await supabase.rpc('insert_group_members', {
        p_group_id: groupId,
        p_member_ids: Array.from(selectedFriends),
      });
      if (error) throw error;
      setShowAddModal(false);
      setSelectedFriends(new Set());
      fetchGroupDetails();
    } catch (err) {
      const msg = 'Failed to add members';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    } finally {
      setAddingMembers(false);
    }
  };

  const renderMember = ({ item }: { item: Member }) => {
    const isCreator = item.id === createdBy;
    const isMe = item.id === user?.id;
    return (
      <View style={styles.memberRow}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{item.username?.[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.username}{isMe ? ' (you)' : ''}</Text>
          {isCreator && (
            <View style={styles.adminBadge}>
              <Crown size={10} color="#00A0DC" />
              <Text style={styles.adminText}>Admin</Text>
            </View>
          )}
        </View>
        {isAdmin && !isCreator && !isMe && (
          <TouchableOpacity onPress={() => handleRemoveMember(item.id, item.username)} style={styles.removeBtn}>
            <Trash2 size={16} color="#FF4444" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderFriend = ({ item }: { item: Friend }) => {
    const selected = selectedFriends.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.friendRow, selected && styles.friendRowSelected]}
        onPress={() => {
          setSelectedFriends((prev) => {
            const next = new Set(prev);
            if (next.has(item.id)) next.delete(item.id);
            else next.add(item.id);
            return next;
          });
        }}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{item.username?.[0]?.toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.memberName}>{item.username}</Text>
        {selected && <Check size={18} color="#00A0DC" />}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00A0DC" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#FDFDFD" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>GROUP NAME</Text>
        <View style={styles.nameRow}>
          {editingName ? (
            <>
              <TextInput
                style={styles.nameInput}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                maxLength={50}
              />
              <TouchableOpacity onPress={handleSaveName} style={styles.iconBtn} disabled={savingName}>
                {savingName ? <ActivityIndicator size="small" color="#00A0DC" /> : <Check size={20} color="#00A0DC" />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEditingName(false); setNewName(groupName); }} style={styles.iconBtn}>
                <X size={20} color="#888" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.groupNameText}>{groupName}</Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => setEditingName(true)} style={styles.iconBtn}>
                  <Edit2 size={18} color="#00A0DC" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.membersHeader}>
          <Text style={styles.sectionLabel}>MEMBERS ({members.length})</Text>
          {isAdmin && (
            <TouchableOpacity onPress={openAddMembers} style={styles.addBtn}>
              <UserPlus size={16} color="#00A0DC" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          scrollEnabled={false}
        />
      </View>

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Members</Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); setSelectedFriends(new Set()); }}>
                <X size={22} color="#FDFDFD" />
              </TouchableOpacity>
            </View>
            {loadingFriends ? (
              <ActivityIndicator color="#00A0DC" style={{ marginTop: 20 }} />
            ) : friends.length === 0 ? (
              <Text style={styles.emptyText}>No friends to add</Text>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(item) => item.id}
                renderItem={renderFriend}
                style={{ maxHeight: 300 }}
              />
            )}
            <TouchableOpacity
              style={[styles.addConfirmBtn, selectedFriends.size === 0 && styles.addConfirmBtnDisabled]}
              onPress={handleAddMembers}
              disabled={selectedFriends.size === 0 || addingMembers}
            >
              {addingMembers ? (
                <ActivityIndicator color="#FDFDFD" />
              ) : (
                <Text style={styles.addConfirmBtnText}>Add {selectedFriends.size > 0 ? `(${selectedFriends.size})` : ''}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0F' },
  loadingContainer: { flex: 1, backgroundColor: '#0D0D0F', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, backgroundColor: '#141417', borderBottomWidth: 1, borderBottomColor: '#252528' },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#FDFDFD' },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 1, marginBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141417', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#252528' },
  groupNameText: { flex: 1, fontSize: 16, color: '#FDFDFD' },
  nameInput: { flex: 1, fontSize: 16, color: '#FDFDFD', padding: 0 },
  iconBtn: { padding: 4, marginLeft: 8 },
  membersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 14, color: '#00A0DC', fontWeight: '600' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#252528' },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#252528', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarInitial: { fontSize: 16, color: '#FDFDFD', fontWeight: '600' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, color: '#FDFDFD' },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  adminText: { fontSize: 11, color: '#00A0DC', fontWeight: '600' },
  removeBtn: { padding: 8 },
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#252528' },
  friendRowSelected: { backgroundColor: '#141417' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#141417', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#FDFDFD' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 20, marginBottom: 20 },
  addConfirmBtn: { backgroundColor: '#00A0DC', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  addConfirmBtnDisabled: { backgroundColor: '#252528' },
  addConfirmBtnText: { color: '#FDFDFD', fontWeight: '600', fontSize: 16 },
});
