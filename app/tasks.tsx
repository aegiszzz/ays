import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Trophy, Star, CheckCircle, Circle, TrendingUp, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';

interface Task {
  id: string;
  title: string;
  description: string;
  points: number;
  task_type: 'daily' | 'weekly' | 'one_time';
  action_type: string;
  required_count: number;
  icon: string;
}

interface UserTask {
  task_id: string;
  current_count: number;
  completed_at: string;
  points_earned: number;
}

interface LeaderboardUser {
  id: string;
  username: string;
  total_points: number;
  avatar_url?: string;
}

export default function TasksScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userTasks, setUserTasks] = useState<UserTask[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'leaderboard'>('tasks');

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      await Promise.all([
        fetchTasks(),
        fetchUserTasks(),
        fetchUserPoints(),
        fetchLeaderboard(),
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true)
      .order('task_type', { ascending: true })
      .order('points', { ascending: false });

    if (error) throw error;
    if (data) setTasks(data);
  };

  const fetchUserTasks = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', user!.id)
      .gte('completed_at', `${today}T00:00:00`);

    if (error) throw error;
    if (data) setUserTasks(data);
  };

  const fetchUserPoints = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('total_points')
      .eq('id', user!.id)
      .maybeSingle();

    if (error) throw error;
    if (data) setTotalPoints(data.total_points || 0);
  };

  const fetchLeaderboard = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, total_points, avatar_url')
      .order('total_points', { ascending: false })
      .limit(10);

    if (error) throw error;
    if (data) setLeaderboard(data);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const isTaskCompleted = (task: Task) => {
    const userTask = userTasks.find(ut => ut.task_id === task.id);
    if (!userTask) return false;

    if (task.task_type === 'one_time') {
      return true;
    }

    return userTask.current_count >= task.required_count;
  };

  const getTaskProgress = (task: Task) => {
    const userTask = userTasks.find(ut => ut.task_id === task.id);
    return userTask ? userTask.current_count : 0;
  };

  const getTaskTypeLabel = (type: string) => {
    switch (type) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'one_time': return 'One Time';
      default: return type;
    }
  };

  const getTaskTypeColor = (type: string) => {
    switch (type) {
      case 'daily': return '#4CAF50';
      case 'weekly': return '#2196F3';
      case 'one_time': return '#FF9800';
      default: return '#999';
    }
  };

  const getUserRank = () => {
    const userIndex = leaderboard.findIndex(u => u.id === user?.id);
    return userIndex >= 0 ? userIndex + 1 : null;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tasks & Points</Text>
        <View style={styles.pointsBadge}>
          <Star size={20} color="#FFD700" fill="#FFD700" />
          <Text style={styles.pointsText}>{totalPoints}</Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tasks' && styles.tabActive]}
          onPress={() => setActiveTab('tasks')}
        >
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>
            Tasks
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'leaderboard' && styles.tabActive]}
          onPress={() => setActiveTab('leaderboard')}
        >
          <Text style={[styles.tabText, activeTab === 'leaderboard' && styles.tabTextActive]}>
            Leaderboard
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'tasks' ? (
          <View style={styles.tasksContainer}>
            {tasks.map(task => {
              const completed = isTaskCompleted(task);
              const progress = getTaskProgress(task);
              const progressPercentage = (progress / task.required_count) * 100;

              return (
                <View key={task.id} style={styles.taskCard}>
                  <View style={styles.taskHeader}>
                    <View style={styles.taskIcon}>
                      {completed ? (
                        <CheckCircle size={24} color="#4CAF50" />
                      ) : (
                        <Circle size={24} color="#999" />
                      )}
                    </View>
                    <View style={styles.taskInfo}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <Text style={styles.taskDescription}>{task.description}</Text>
                      <View style={styles.taskMeta}>
                        <View
                          style={[
                            styles.taskTypeBadge,
                            { backgroundColor: getTaskTypeColor(task.task_type) + '20' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.taskTypeText,
                              { color: getTaskTypeColor(task.task_type) },
                            ]}
                          >
                            {getTaskTypeLabel(task.task_type)}
                          </Text>
                        </View>
                        <View style={styles.taskPoints}>
                          <Star size={14} color="#FFD700" fill="#FFD700" />
                          <Text style={styles.taskPointsText}>{task.points} points</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {task.required_count > 1 && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.min(progressPercentage, 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {progress}/{task.required_count}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.leaderboardContainer}>
            {getUserRank() && (
              <View style={styles.userRankCard}>
                <Trophy size={24} color="#FFD700" />
                <Text style={styles.userRankText}>
                  Your Rank: #{getUserRank()}
                </Text>
                <Text style={styles.userRankPoints}>{totalPoints} points</Text>
              </View>
            )}

            {leaderboard.map((user, index) => (
              <TouchableOpacity
                key={user.id}
                style={styles.leaderboardItem}
                onPress={() => router.push(`/user-profile?userId=${user.id}`)}
              >
                <View style={styles.leaderboardRank}>
                  {index < 3 ? (
                    <Trophy
                      size={24}
                      color={
                        index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32'
                      }
                      fill={
                        index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32'
                      }
                    />
                  ) : (
                    <Text style={styles.leaderboardRankText}>#{index + 1}</Text>
                  )}
                </View>
                <View style={styles.leaderboardUserInfo}>
                  <Text style={styles.leaderboardUsername}>@{user.username}</Text>
                  <View style={styles.leaderboardPoints}>
                    <Star size={14} color="#FFD700" fill="#FFD700" />
                    <Text style={styles.leaderboardPointsText}>
                      {user.total_points} points
                    </Text>
                  </View>
                </View>
                {index < 3 && <TrendingUp size={20} color="#4CAF50" />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'center',
    marginRight: -28,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pointsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#000',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  tabTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tasksContainer: {
    padding: 16,
    gap: 12,
  },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  taskHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  taskIcon: {
    marginTop: 2,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  taskDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  taskTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  taskTypeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  taskPoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskPointsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  progressContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E5EA',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    minWidth: 40,
    textAlign: 'right',
  },
  leaderboardContainer: {
    padding: 16,
  },
  userRankCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  userRankText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    marginLeft: 12,
  },
  userRankPoints: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  leaderboardItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  leaderboardRank: {
    width: 40,
    alignItems: 'center',
  },
  leaderboardRankText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#666',
  },
  leaderboardUserInfo: {
    flex: 1,
  },
  leaderboardUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  leaderboardPoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  leaderboardPointsText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
});
