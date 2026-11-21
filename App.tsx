import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Image, KeyboardAvoidingView, Linking,
  Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch,
  Text, TextInput, View, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder
} from 'expo-audio';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';

const C = {
  bg: '#08090B', panel: '#111318', panel2: '#191C23', line: '#292D36',
  orange: '#FF842B', orange2: '#FFB06B', white: '#F7F8FA',
  muted: '#9298A4', green: '#55D6A0', red: '#FF6666'
};
const STICKERS = ['🧡','😂','🥹','🔥','✨','😎','🫶','🤍','💀','🥳','🌙','🐈','🍊','💯','👀','🎉'];
const FRAMES = [
  { id: 'none', label: 'Classic', color: '#FF7A18' },
  { id: 'sunset', label: 'Sunset', color: '#FF5E62' },
  { id: 'gold', label: 'Gold', color: '#E9C46A' },
  { id: 'ice', label: 'Ice', color: '#78DCE8' },
  { id: 'violet', label: 'Violet', color: '#B58CFF' }
];

type Profile = {
  id: string; username: string; display_name?: string; avatar_url?: string | null;
  bio?: string; accent_color?: string; frame_id?: string; animated_pfp?: boolean;
  profile_effect?: string; status_text?: string;
};
type Message = {
  id: string; conversation_id: string; sender_id: string; body: string;
  created_at: string; message_type?: string; media_path?: string | null;
  duration_seconds?: number | null; metadata?: Record<string, any>;
};
type Conversation = {
  id: string; kind: 'direct' | 'group'; title?: string | null; avatar_url?: string | null;
  members: Profile[]; last?: Message; updated_at?: string; created_at?: string;
};
type Story = {
  id: string; user_id: string; media_url: string; media_type: string; caption: string;
  expires_at: string; owner?: Profile;
};
type Note = { user_id: string; body: string; color: string; expires_at: string; updated_at?: string; owner?: Profile };

function ping() { Haptics.selectionAsync().catch(() => {}); }
function shortTime(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function initials(p?: Profile | null) {
  const name = p?.display_name || p?.username || 'O';
  return name.slice(0, 1).toUpperCase();
}
function Avatar({ profile, size = 52, lite = false }: { profile?: Profile | null; size?: number; lite?: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (profile?.animated_pfp && !lite) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.045, duration: 1050, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1050, useNativeDriver: true })
      ]));
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(1);
  }, [profile?.animated_pfp, lite, pulse]);
  const frame = FRAMES.find(f => f.id === profile?.frame_id) || FRAMES[0];
  return (
    <Animated.View style={{ width: size, height: size, borderRadius: size, borderWidth: profile?.frame_id && profile.frame_id !== 'none' ? 2.5 : 1, borderColor: frame.color, padding: 2, transform: [{ scale: pulse }] }}>
      <View style={{ flex: 1, borderRadius: size, overflow: 'hidden', backgroundColor: '#29231F', alignItems: 'center', justifyContent: 'center' }}>
        {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" fadeDuration={0} /> :
          <Text style={{ color: C.orange2, fontSize: size * 0.38, fontWeight: '800' }}>{initials(profile)}</Text>}
      </View>
    </Animated.View>
  );
}
function Action({ label, onPress, quiet = false, small = false }: { label: string; onPress: () => void; quiet?: boolean; small?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, quiet && styles.actionQuiet, small && styles.actionSmall, pressed && { opacity: 0.72 }]}>
    <Text style={[styles.actionText, quiet && { color: C.white }, small && { fontSize: 12 }]}>{label}</Text>
  </Pressable>;
}
function VoiceBubble({ path, mine }: { path: string; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const player = useAudioPlayer(url);
  useEffect(() => {
    let active = true;
    supabase.storage.from('orange-chat-media').createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [path]);
  return <Pressable onPress={() => url && player.play()} style={styles.voiceBubble}>
    <Text style={{ color: mine ? '#17100A' : C.orange, fontSize: 18 }}>▶</Text>
    <View style={{ flex: 1 }}>
      <View style={styles.wave}><Text style={{ color: mine ? '#3C2918' : C.muted, letterSpacing: 2 }}>▂ ▄ ▆ ▃ ▅ ▂ ▇ ▄ ▃</Text></View>
      <Text style={{ color: mine ? '#50341C' : C.muted, fontSize: 10 }}>VOICE NOTE</Text>
    </View>
  </Pressable>;
}
function PhotoBubble({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage.from('orange-chat-media').createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [path]);
  return url ? <Image source={{ uri: url }} style={styles.messagePhoto} resizeMode="cover" fadeDuration={0} /> :
    <View style={[styles.messagePhoto, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={C.orange} /></View>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState<'chats' | 'updates' | 'notes' | 'profile'>('chats');
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<{ message_id: string; user_id: string; emoji: string }[]>([]);
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null);
  const [draft, setDraft] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [wantedUsername, setWantedUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupUsernames, setGroupUsernames] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [liteMode, setLiteMode] = useState(Platform.OS === 'android' && Dimensions.get('window').width <= 360);
  const [recording, setRecording] = useState(false);
  const [storyOpen, setStoryOpen] = useState<Story | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recordStarted = useRef(0);
  const listRef = useRef<FlatList<Message>>(null);
  const user = session?.user;
  const visibleConversations = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter(chat => [chatTitle(chat), chat.last?.body || '', ...chat.members.map(member => member.username + ' ' + (member.display_name || ''))].join(' ').toLowerCase().includes(query));
  }, [conversations, chatSearch]);

  const handleAuthUrl = useCallback(async (url: string) => {
    try {
      const parsed = new URL(url);
      const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const read = (key: string) => parsed.searchParams.get(key) ?? hash.get(key);
      const errorDescription = read('error_description');
      const errorCode = read('error_code') || read('error');
      if (errorDescription || errorCode) throw new Error(errorDescription || errorCode || 'The link could not be verified.');
      const code = read('code');
      const tokenHash = read('token_hash');
      const type = read('type');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (type === 'recovery') setPasswordRecovery(true);
        else Alert.alert('Email verified', 'Your ORANGE account is ready.');
        return;
      }
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: (type || 'email') as any });
        if (error) throw error;
        if (type === 'recovery') setPasswordRecovery(true);
        else Alert.alert('Email verified', 'Your ORANGE account is ready.');
        return;
      }
      const accessToken = read('access_token');
      const refreshToken = read('refresh_token');
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
        if (type === 'recovery') setPasswordRecovery(true);
        else Alert.alert('Email verified', 'Your ORANGE account is ready.');
      }
    } catch (e: any) {
      Alert.alert('Could not verify email', e?.message || 'Open the newest verification email and try again.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    Linking.getInitialURL().then(url => { if (active && url) handleAuthUrl(url); }).catch(() => {});
    const subscription = Linking.addEventListener('url', event => handleAuthUrl(event.url));
    return () => { active = false; subscription.remove(); };
  }, [handleAuthUrl]);

  const loadData = useCallback(async (uid: string) => {
    const profileRes = await supabase.from('profiles')
      .select('id,username,display_name,avatar_url,bio,accent_color,frame_id,animated_pfp,profile_effect,status_text')
      .eq('id', uid).maybeSingle();
    if (profileRes.data) setProfile(profileRes.data as Profile);

    const memberRes = await supabase.from('conversation_members').select('conversation_id').eq('user_id', uid);
    const ids = (memberRes.data || []).map((x: any) => x.conversation_id);
    if (ids.length) {
      const [convRes, rosterRes, msgRes] = await Promise.all([
        supabase.from('conversations').select('*').in('id', ids).order('last_message_at', { ascending: false, nullsFirst: false }),
        supabase.from('conversation_members').select('conversation_id,user_id,role').in('conversation_id', ids),
        supabase.from('messages').select('*').in('conversation_id', ids).order('created_at', { ascending: false }).limit(160)
      ]);
      const memberIds = Array.from(new Set((rosterRes.data || []).map((x: any) => x.user_id)));
      const peopleRes = memberIds.length ? await supabase.from('profiles').select('id,username,display_name,avatar_url,accent_color,frame_id,animated_pfp').in('id', memberIds) : { data: [] as any[] };
      const people = new Map((peopleRes.data || []).map((p: any) => [p.id, p]));
      const mapped = (convRes.data || []).map((c: any) => {
        const members = (rosterRes.data || []).filter((m: any) => m.conversation_id === c.id).map((m: any) => people.get(m.user_id)).filter(Boolean) as Profile[];
        const last = (msgRes.data || []).find((m: any) => m.conversation_id === c.id) as Message | undefined;
        return { ...c, members, last };
      });
      mapped.sort((a: Conversation, b: Conversation) => new Date(b.last?.created_at || b.updated_at || b.created_at).getTime() - new Date(a.last?.created_at || a.updated_at || a.created_at).getTime());
      setConversations(mapped);
    } else setConversations([]);

    const [storyRes, noteRes] = await Promise.all([
      supabase.from('stories').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(80),
      supabase.from('notes').select('*').gt('expires_at', new Date().toISOString()).order('updated_at', { ascending: false }).limit(80)
    ]);
    const ownerIds = Array.from(new Set([...(storyRes.data || []).map((x: any) => x.user_id), ...(noteRes.data || []).map((x: any) => x.user_id)]));
    const ownerRes = ownerIds.length ? await supabase.from('profiles').select('id,username,display_name,avatar_url,accent_color,frame_id,animated_pfp').in('id', ownerIds) : { data: [] as any[] };
    const owners = new Map((ownerRes.data || []).map((p: any) => [p.id, p]));
    setStories((storyRes.data || []).map((s: any) => ({ ...s, owner: owners.get(s.user_id) })));
    setNotes((noteRes.data || []).map((n: any) => ({ ...n, owner: owners.get(n.user_id) })));
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setSession(data.session); setBooting(false); }
    }).catch(() => setBooting(false));
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session?.user.id) loadData(session.user.id);
    else { setProfile(null); setConversations([]); setStories([]); setNotes([]); }
  }, [session?.user.id, loadData]);

  useEffect(() => {
    if (!selectedChat || !user) return;
    let active = true;
    supabase.from('messages').select('*').eq('conversation_id', selectedChat.id).order('created_at', { ascending: true }).limit(120)
      .then(({ data }) => { if (active) setMessages((data || []) as Message[]); });
    supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', selectedChat.id).eq('user_id', user.id).then(() => {});
    const channel = supabase.channel('orange-chat-' + selectedChat.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + selectedChat.id }, (payload) => {
        const incoming = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]);
      }).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [selectedChat?.id, user?.id]);

  useEffect(() => {
    if (!selectedChat || !messages.length) { setReactions([]); return; }
    let active = true;
    const ids = messages.map(message => message.id);
    supabase.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids)
      .then(({ data, error }) => {
        if (active && !error) setReactions((data || []) as { message_id: string; user_id: string; emoji: string }[]);
      });
    return () => { active = false; };
  }, [selectedChat?.id, messages]);

  const doAuth = async () => {
    if (!email.trim() || password.length < 8) return Alert.alert('Check your details', 'Enter a valid email and a password with at least 8 characters.');
    if (authMode === 'signup' && !/^[a-z0-9_]{3,20}$/.test(wantedUsername.trim().toLowerCase())) {
      return Alert.alert('Username format', 'Use 3–20 lowercase letters, numbers or underscores.');
    }
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password,
          options: { emailRedirectTo: 'orange://auth/callback', data: { username: wantedUsername.trim().toLowerCase(), display_name: displayName.trim() || wantedUsername.trim() } }
        });
        if (error) throw error;
        if (!data.session) Alert.alert('Verify your email', 'We sent a confirmation link. Open it on this phone; it should return to ORANGE automatically.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
      }
    } catch (e: any) { Alert.alert('Could not continue', e.message || 'Please try again.'); }
    finally { setAuthBusy(false); }
  };

  const resetPassword = async () => {
    if (!email.trim()) return Alert.alert('Email required', 'Enter your account email first.');
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: 'orange://auth/callback' });
      if (error) throw error;
      Alert.alert('Reset link sent', 'Check your inbox for a password reset link.');
    } catch (e: any) { Alert.alert('Could not send reset link', e.message || 'Please try again.'); }
    finally { setAuthBusy(false); }
  };

  const resendVerification = async () => {
    if (!email.trim()) return Alert.alert('Email required', 'Enter the email address you used to sign up.');
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: 'orange://auth/callback' }
      });
      if (error) throw error;
      Alert.alert('Verification email sent', 'Open the newest email on this phone to finish creating your ORANGE account.');
    } catch (e: any) {
      Alert.alert('Could not resend email', e?.message || 'Wait a moment and try again.');
    } finally { setAuthBusy(false); }
  };

  const saveNewPassword = async () => {
    if (newPassword.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    if (newPassword !== confirmNewPassword) return Alert.alert('Passwords do not match', 'Enter the same password in both fields.');
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordRecovery(false); setNewPassword(''); setConfirmNewPassword('');
      Alert.alert('Password updated', 'Your password has been changed.');
    } catch (e: any) { Alert.alert('Could not update password', e.message || 'Please try again.'); }
    finally { setAuthBusy(false); }
  };

  const openChat = async (chat: Conversation) => {
    ping(); setSelectedChat(chat); setMessages([]);
  };
  const startDirect = async () => {
    if (!searchUsername.trim() || !user) return;
    try {
      const { data, error } = await supabase.rpc('start_direct_conversation', { p_username: searchUsername.trim().toLowerCase() });
      if (error) throw error;
      const id = data as string;
      await loadData(user.id);
      const { data: conv, error: convError } = await supabase.from('conversations').select('*').eq('id', id).single();
      if (convError) throw convError;
      const roster = await supabase.from('conversation_members').select('user_id').eq('conversation_id', id);
      const ids = (roster.data || []).map((x: any) => x.user_id);
      const people = await supabase.from('profiles').select('id,username,display_name,avatar_url,accent_color,frame_id,animated_pfp').in('id', ids);
      setSelectedChat({ ...conv, members: (people.data || []) as Profile[] });
      setNewChatOpen(false); setSearchUsername('');
    } catch (e: any) { Alert.alert('Could not start chat', e.message || 'Check the username and try again.'); }
  };
  const createGroup = async () => {
    if (!user || !groupTitle.trim()) return Alert.alert('Group name needed', 'Add a name for your group.');
    const names = Array.from(new Set(groupUsernames.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)));
    if (!names.length) return Alert.alert('Add people', 'Enter usernames separated by commas.');
    try {
      const people = await supabase.from('profiles').select('id,username,display_name,avatar_url,accent_color,frame_id,animated_pfp').in('username', names);
      if (people.error) throw people.error;
      const found = people.data || [];
      const missing = names.filter(n => !found.some((p: any) => p.username === n));
      if (missing.length) return Alert.alert('Username not found', missing.join(', '));
      const { data: conv, error } = await supabase.from('conversations')
        .insert({ kind: 'group', title: groupTitle.trim(), created_by: user.id, user_a: user.id, user_b: null })
        .select('id,kind,title,avatar_url,created_at').single();
      if (error) throw error;
      const rows = [{ conversation_id: conv.id, user_id: user.id, role: 'owner' },
        ...found.filter((p: any) => p.id !== user.id).map((p: any) => ({ conversation_id: conv.id, user_id: p.id, role: 'member' }))];
      const add = await supabase.from('conversation_members').insert(rows);
      if (add.error) throw add.error;
      const members = [...found.filter((p: any) => p.id !== user.id), profile].filter(Boolean) as Profile[];
      setSelectedChat({ ...conv, members }); setGroupOpen(false); setGroupTitle(''); setGroupUsernames('');
      loadData(user.id);
    } catch (e: any) { Alert.alert('Group not created', e.message || 'Please try again.'); }
  };

  const send = async (body: string, type: string = 'text', mediaPath?: string, duration?: number) => {
    if (!user || !selectedChat || !body.trim()) return;
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: selectedChat.id, sender_id: user.id, body: body.trim(),
      message_type: type, media_path: mediaPath || null, duration_seconds: duration || null
    }).select('*').single();
    if (error) { Alert.alert('Message not sent', error.message); return; }
    setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data as Message]);
    setDraft('');
    loadData(user.id);
  };
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    const result = existing
      ? await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji)
      : await supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.id, emoji });
    if (result.error) { Alert.alert('Reaction not saved', result.error.message); return; }
    setReactions(prev => existing ? prev.filter(r => !(r.message_id === messageId && r.user_id === user.id && r.emoji === emoji)) : [...prev, { message_id: messageId, user_id: user.id, emoji }]);
  };
  const handleMessageLongPress = (message: Message) => setReactionTarget(message);
  const deleteMessage = async () => {
    if (!reactionTarget || !user || reactionTarget.sender_id !== user.id) return;
    const targetId = reactionTarget.id;
    const { error } = await supabase.from('messages').delete().eq('id', targetId).eq('sender_id', user.id);
    if (error) Alert.alert('Could not delete', error.message);
    else { setMessages(prev => prev.filter(m => m.id !== targetId)); setReactions(prev => prev.filter(r => r.message_id !== targetId)); }
    setReactionTarget(null);
  };

  const sendText = () => { if (draft.trim()) send(draft); };
  const sendSticker = (sticker: string) => { setShowStickers(false); send(sticker, 'sticker'); };
  const startVoice = async () => {
    if (recording) {
      try {
        await recorder.stop();
        setRecording(false);
        const uri = recorder.uri;
        if (!uri || !user || !selectedChat) return;
        const blob = await fetch(uri).then(r => r.blob());
        const path = selectedChat.id + '/' + user.id + '/' + Date.now() + '.3gp';
        const up = await supabase.storage.from('orange-chat-media').upload(path, blob, { contentType: 'audio/3gpp', upsert: false });
        if (up.error) throw up.error;
        const seconds = Math.max(1, Math.round((Date.now() - recordStarted.current) / 1000));
        await send('Voice message', 'audio', path, seconds);
      } catch (e: any) { Alert.alert('Voice note failed', e.message || 'Try again.'); }
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return Alert.alert('Microphone permission', 'Allow microphone access to record voice notes.');
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordStarted.current = Date.now();
    setRecording(true);
    ping();
  };
  const uploadChatPhoto = async () => {
    if (!user || !selectedChat) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: liteMode ? 0.48 : 0.72 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const asset = result.assets[0];
      const blob = await fetch(asset.uri).then(r => r.blob());
      const mime = asset.mimeType || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const path = selectedChat.id + '/' + user.id + '/' + Date.now() + '.' + ext;
      const up = await supabase.storage.from('orange-chat-media').upload(path, blob, { contentType: mime, upsert: false });
      if (up.error) throw up.error;
      await send('Photo', 'image', path);
    } catch (e: any) { Alert.alert('Photo not sent', e.message || 'Try again.'); }
  };
  const addStory = async () => {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: liteMode ? 0.5 : 0.78 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const asset = result.assets[0];
      const blob = await fetch(asset.uri).then(r => r.blob());
      const mime = asset.mimeType || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : 'jpg';
      const path = user.id + '/instants/' + Date.now() + '.' + ext;
      const up = await supabase.storage.from('orange-profile-media').upload(path, blob, { contentType: mime, upsert: false });
      if (up.error) throw up.error;
      const url = supabase.storage.from('orange-profile-media').getPublicUrl(path).data.publicUrl;
      const ins = await supabase.from('stories').insert({ user_id: user.id, media_url: url, media_type: 'image' });
      if (ins.error) throw ins.error;
      await loadData(user.id);
      Alert.alert('Instant posted', 'Your Instant will disappear after 24 hours.');
    } catch (e: any) { Alert.alert('Could not post', e.message || 'Try again.'); }
  };
  const saveNote = async () => {
    if (!user || !noteDraft.trim()) return;
    const { error } = await supabase.from('notes').upsert({
      user_id: user.id, body: noteDraft.trim().slice(0, 80), color: C.orange,
      updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString()
    });
    if (error) Alert.alert('Note not saved', error.message);
    else { setNoteDraft(''); loadData(user.id); }
  };
  const updateProfile = async (patch: Record<string, any>) => {
    if (!user) return;
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id)
      .select('id,username,display_name,avatar_url,bio,accent_color,frame_id,animated_pfp,profile_effect,status_text').single();
    if (error) Alert.alert('Profile not saved', error.message);
    else setProfile(data as Profile);
  };
  const uploadAvatar = async () => {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: liteMode ? 0.5 : 0.82, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    try {
      const asset = result.assets[0]; const blob = await fetch(asset.uri).then(r => r.blob());
      const mime = asset.mimeType || 'image/jpeg'; const ext = mime.includes('png') ? 'png' : 'jpg';
      const path = user.id + '/avatar-' + Date.now() + '.' + ext;
      const up = await supabase.storage.from('orange-profile-media').upload(path, blob, { contentType: mime, upsert: false });
      if (up.error) throw up.error;
      const url = supabase.storage.from('orange-profile-media').getPublicUrl(path).data.publicUrl;
      await updateProfile({ avatar_url: url });
    } catch (e: any) { Alert.alert('Avatar upload failed', e.message || 'Try again.'); }
  };
  const logout = async () => { await supabase.auth.signOut(); setSelectedChat(null); };

  const chatTitle = (chat: Conversation) => chat.kind === 'group'
    ? (chat.title || 'Group')
    : (chat.members.find(m => m.id !== user?.id)?.display_name || chat.members.find(m => m.id !== user?.id)?.username || 'Chat');
  const chatAvatar = (chat: Conversation) => chat.kind === 'group' ? null : chat.members.find(m => m.id !== user?.id);
  const myNote = notes.find(n => n.user_id === user?.id);
  const storyOwners = useMemo(() => {
    const map = new Map<string, Story[]>();
    stories.forEach(s => map.set(s.user_id, [...(map.get(s.user_id) || []), s]));
    return Array.from(map.values()).map(arr => arr[0]);
  }, [stories]);

  if (booting) return <View style={styles.center}><ActivityIndicator color={C.orange} size="large" /><Text style={styles.muted}>Opening ORANGE…</Text></View>;
  if (!session || !profile) return (
    <View style={styles.authRoot}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <LinearGradient colors={['#24140A', C.bg, C.bg]} style={styles.authGlow}>
        <View style={styles.logoMark}><Text style={styles.logoMarkText}>O</Text></View>
        <Text style={styles.brand}>ORANGE</Text>
        <Text style={styles.tagline}>Your people. Your space. Your pace.</Text>
        <View style={styles.authCard}>
          <Text style={styles.sectionTitle}>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</Text>
          {authMode === 'signup' && <>
            <Text style={styles.fieldLabel}>USERNAME</Text>
            <TextInput value={wantedUsername} onChangeText={setWantedUsername} autoCapitalize="none" placeholder="your_unique_name" placeholderTextColor="#686868" style={styles.field} maxLength={20} />
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
            <TextInput value={displayName} onChangeText={setDisplayName} placeholder="What should people call you?" placeholderTextColor="#686868" style={styles.field} maxLength={40} />
          </>}
          <Text style={styles.fieldLabel}>EMAIL</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#686868" style={styles.field} />
          <Text style={styles.fieldLabel}>PASSWORD</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" placeholderTextColor="#686868" style={styles.field} />
          <Action label={authBusy ? 'PLEASE WAIT…' : authMode === 'signup' ? 'CREATE ACCOUNT  →' : 'SIGN IN  →'} onPress={doAuth} />
          {authMode === 'signup' && <Pressable onPress={resendVerification} disabled={authBusy} style={{ paddingTop: 13, alignItems: 'center' }}><Text style={{ color: C.orange2, fontSize: 12, fontWeight: '700' }}>Resend verification email</Text></Pressable>}
          {authMode === 'login' && <Pressable onPress={resetPassword} disabled={authBusy} style={{ paddingTop: 15, alignItems: 'center' }}><Text style={{ color: C.orange2, fontSize: 12, fontWeight: '700' }}>Forgot password?</Text></Pressable>}
          <Pressable onPress={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')} style={{ padding: 14, alignItems: 'center' }}>
            <Text style={styles.muted}>{authMode === 'signup' ? 'Already have an account? ' : 'New to ORANGE? '}<Text style={{ color: C.orange, fontWeight: '800' }}>{authMode === 'signup' ? 'Sign in' : 'Create account'}</Text></Text>
          </Pressable>
          <Text style={styles.footnote}>Usernames are unique. Use a real email so you can verify and recover your account.</Text>
        </View>
      </LinearGradient>
    </View>
  );

  if (selectedChat) return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.chatHeader}>
        <Pressable onPress={() => { setSelectedChat(null); loadData(user!.id); }} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        {selectedChat.kind === 'group' ? <View style={styles.groupAvatar}><Text style={{ color: C.orange, fontWeight: '900' }}>◎</Text></View> : <Avatar profile={chatAvatar(selectedChat)} size={42} lite={liteMode} />}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.chatHeaderName}>{chatTitle(selectedChat)}</Text>
          <Text style={styles.chatHeaderSub}>{selectedChat.kind === 'group' ? selectedChat.members.length + ' members' : '@' + (chatAvatar(selectedChat)?.username || 'orange')}</Text>
        </View>
        <Pressable onPress={() => Alert.alert('Chat details', selectedChat.kind === 'group' ? selectedChat.members.map(m => '@' + m.username).join('\n') : 'Private conversation')} style={styles.headerIcon}><Text style={styles.headerIconText}>⋯</Text></Pressable>
      </View>
      <FlatList ref={listRef} data={messages} keyExtractor={m => m.id} contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: !liteMode })}
        renderItem={({ item }) => {
          const mine = item.sender_id === user?.id;
          return <View style={[styles.messageRow, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
            <Pressable onLongPress={() => handleMessageLongPress(item)} delayLongPress={350} style={[styles.messageBubble, mine ? styles.myBubble : styles.theirBubble]}>
              {item.message_type === 'sticker' ? <Text style={{ fontSize: 42 }}>{item.body}</Text> :
               item.message_type === 'audio' && item.media_path ? <VoiceBubble path={item.media_path} mine={mine} /> :
               item.message_type === 'image' && item.media_path ? <PhotoBubble path={item.media_path} /> :
               <Text style={[styles.messageText, mine && { color: '#21150C' }]}>{item.body}</Text>}
              <Text style={[styles.messageTime, mine && { color: '#775638' }]}>{shortTime(item.created_at)}</Text>
              {reactions.some(r => r.message_id === item.id) && <View style={styles.reactionRow}>{Array.from(new Set(reactions.filter(r => r.message_id === item.id).map(r => r.emoji))).map(emoji => {
                const group = reactions.filter(r => r.message_id === item.id && r.emoji === emoji);
                const active = group.some(r => r.user_id === user?.id);
                return <Pressable key={emoji} onPress={() => toggleReaction(item.id, emoji)} style={[styles.reactionChip, active && styles.reactionChipActive]}><Text style={styles.reactionText}>{emoji} {group.length}</Text></Pressable>;
              })}</View>}
            </Pressable>
          </View>;
        }} />
      {showStickers && <View style={styles.stickerTray}>{STICKERS.map(s => <Pressable key={s} onPress={() => sendSticker(s)} style={styles.sticker}><Text style={{ fontSize: 26 }}>{s}</Text></Pressable>)}</View>}
      {recording && <View style={styles.recordingBar}><View style={styles.recordDot} /><Text style={{ color: C.orange, fontWeight: '700' }}>Recording voice note… tap the mic to send</Text></View>}
      <View style={styles.composer}>
        <Pressable onPress={uploadChatPhoto} style={styles.composerIcon}><Text style={styles.composerIconText}>＋</Text></Pressable>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Message…" placeholderTextColor="#777" multiline style={styles.composerInput} maxLength={5000} />
        <Pressable onPress={() => setShowStickers(v => !v)} style={styles.composerIcon}><Text style={styles.composerIconText}>☺</Text></Pressable>
        <Pressable onPress={startVoice} style={[styles.micButton, recording && { backgroundColor: C.red }]}><Text style={{ color: '#15100C', fontWeight: '900' }}>{recording ? '■' : '●'}</Text></Pressable>
        <Pressable onPress={sendText} style={styles.sendButton}><Text style={{ color: '#17100A', fontWeight: '900' }}>➤</Text></Pressable>
      </View>
      <Modal visible={!!reactionTarget} transparent animationType="fade" onRequestClose={() => setReactionTarget(null)}>
        <Pressable style={styles.modalShade} onPress={() => setReactionTarget(null)}>
          <Pressable style={styles.reactionModal} onPress={() => {}}>
            <Text style={styles.sectionTitle}>React to message</Text>
            <View style={styles.reactionPicker}>{['🧡','😂','🔥','👍','😮','😢','🎉','✨'].map(emoji => <Pressable key={emoji} onPress={() => { if (reactionTarget) toggleReaction(reactionTarget.id, emoji); setReactionTarget(null); }} style={styles.reactionOption}><Text style={{ fontSize: 27 }}>{emoji}</Text></Pressable>)}</View>
            {reactionTarget?.sender_id === user?.id && <Pressable onPress={deleteMessage} style={styles.deleteMessage}><Text style={{ color: C.red, fontWeight: '800' }}>Delete message</Text></Pressable>}
            <Pressable onPress={() => setReactionTarget(null)} style={{ paddingVertical: 12, alignItems: 'center' }}><Text style={styles.muted}>CANCEL</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.topBar}>
        <View><Text style={styles.topEyebrow}>A LITTLE CLOSER, EVERY DAY</Text><Text style={styles.topTitle}>ORANGE<Text style={{ color: C.orange }}>.</Text></Text></View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => setNewChatOpen(true)} style={styles.topIcon}><Text style={styles.topIconText}>⌕</Text></Pressable>
          <Pressable onPress={() => setGroupOpen(true)} style={styles.topIcon}><Text style={styles.topIconText}>＋</Text></Pressable>
        </View>
      </View>

      {tab === 'chats' && <>
        <View style={styles.searchPill}><Text style={{ color: C.muted, fontSize: 16 }}>⌕</Text><TextInput value={chatSearch} onChangeText={setChatSearch} placeholder="Search chats, people or messages" placeholderTextColor={C.muted} style={styles.searchInput} returnKeyType="search" clearButtonMode="while-editing" /></View>
        <View style={styles.storiesHeader}><Text style={styles.sectionTitle}>Instants</Text><Pressable onPress={addStory}><Text style={styles.orangeLink}>+ Add instant</Text></Pressable></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyStrip}>
          <Pressable onPress={addStory} style={styles.storyItem}><View style={styles.addStoryCircle}><Text style={{ color: C.orange, fontSize: 26 }}>＋</Text></View><Text style={styles.storyName}>Your story</Text></Pressable>
          {storyOwners.map(s => <Pressable key={s.id} onPress={() => setStoryOpen(s)} style={styles.storyItem}>
            <View style={styles.storyRing}><Avatar profile={s.owner} size={58} lite={liteMode} /></View><Text style={styles.storyName} numberOfLines={1}>{s.owner?.display_name || s.owner?.username || 'Member'}</Text>
          </Pressable>)}
        </ScrollView>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Messages</Text><Text style={styles.muted}>{conversations.length} chats</Text></View>
        <FlatList data={visibleConversations} keyExtractor={c => c.id} contentContainerStyle={{ paddingBottom: 18 }}
          ListEmptyComponent={chatSearch.trim() ? <View style={styles.empty}><Text style={styles.emptyIcon}>⌕</Text><Text style={styles.emptyTitle}>No matching chats</Text><Text style={styles.muted}>Try another name or message.</Text></View> : <View style={styles.empty}><Text style={styles.emptyIcon}>✳</Text><Text style={styles.emptyTitle}>Your inbox is fresh</Text><Text style={styles.muted}>Start a private chat by username, or create a group.</Text><Action label="START A CHAT" onPress={() => setNewChatOpen(true)} /></View>}
          renderItem={({ item }) => {
            const other = chatAvatar(item);
            return <Pressable onPress={() => openChat(item)} style={({ pressed }) => [styles.chatRow, pressed && { backgroundColor: '#191919' }]}>
              {item.kind === 'group' ? <View style={styles.groupAvatarLarge}><Text style={{ color: C.orange, fontSize: 23 }}>◎</Text></View> : <Avatar profile={other} size={52} lite={liteMode} />}
              <View style={{ flex: 1, marginLeft: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, paddingVertical: 13 }}>
                <View style={styles.chatRowTop}><Text style={styles.chatName}>{chatTitle(item)}</Text><Text style={styles.chatTime}>{shortTime(item.last?.created_at)}</Text></View>
                <Text numberOfLines={1} style={styles.chatPreview}>{item.last?.message_type === 'audio' ? '● Voice note' : item.last?.message_type === 'image' ? '▧ Photo' : item.last?.body || (item.kind === 'group' ? item.members.length + ' members' : 'Say hello')}</Text>
              </View>
            </Pressable>;
          }} />
      </>}

      {tab === 'updates' && <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.pageHeading}><Text style={styles.pageTitle}>Instants</Text><Action label="+ POST" onPress={addStory} small /></View>
        <Text style={styles.muted}>Photos that disappear after 24 hours.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyStrip}>
          <Pressable onPress={addStory} style={styles.storyItem}><View style={styles.addStoryCircle}><Text style={{ color: C.orange, fontSize: 26 }}>＋</Text></View><Text style={styles.storyName}>Add instant</Text></Pressable>
          {storyOwners.map(s => <Pressable key={s.id} onPress={() => setStoryOpen(s)} style={styles.storyItem}><View style={styles.storyRing}><Avatar profile={s.owner} size={58} lite={liteMode} /></View><Text style={styles.storyName}>{s.owner?.username}</Text></Pressable>)}
        </ScrollView>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent Instants</Text></View>
        {stories.map(s => <Pressable key={s.id} onPress={() => setStoryOpen(s)} style={styles.updateCard}>
          <Avatar profile={s.owner} size={42} lite={liteMode} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.chatName}>{s.owner?.display_name || s.owner?.username}</Text><Text style={styles.muted}>@{s.owner?.username} · {shortTime(s.expires_at)}</Text></View><Text style={styles.orangeLink}>VIEW</Text>
        </Pressable>)}
      </ScrollView>}

      {tab === 'notes' && <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.pageTitle}>Notes</Text><Text style={styles.muted}>Little thoughts, up for 24 hours.</Text>
        <View style={styles.noteComposer}><TextInput value={noteDraft} onChangeText={setNoteDraft} placeholder="What’s on your mind?" placeholderTextColor="#777" maxLength={80} style={styles.noteInput} /><Pressable onPress={saveNote} style={styles.notePost}><Text style={{ color: '#17100A', fontWeight: '900' }}>POST</Text></Pressable></View>
        {myNote && <View style={styles.ownNote}><Text style={styles.noteTag}>YOUR NOTE</Text><Text style={styles.ownNoteText}>{myNote.body}</Text></View>}
        {notes.filter(n => n.user_id !== user?.id).map(n => <View key={n.user_id} style={styles.noteCard}>
          <Avatar profile={n.owner} size={42} lite={liteMode} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.chatName}>{n.owner?.display_name || n.owner?.username}</Text><Text style={styles.noteText}>{n.body}</Text><Text style={styles.muted}>@{n.owner?.username} · {shortTime(n.updated_at)}</Text></View>
        </View>)}
        {notes.length <= 1 && <Text style={[styles.muted, { marginTop: 24 }]}>When people you follow post a Note, it will appear here.</Text>}
      </ScrollView>}

      {tab === 'profile' && <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.profileHero}>
          <Pressable onPress={uploadAvatar}><Avatar profile={profile} size={94} lite={liteMode} /><Text style={styles.editAvatar}>EDIT</Text></Pressable>
          <Text style={styles.profileName}>{profile.display_name || profile.username}</Text>
          <Text style={styles.profileHandle}>@{profile.username}</Text>
          <Text style={styles.profileBio}>{profile.bio || 'Make this space yours.'}</Text>
          <Text style={styles.profileMail}>{user?.email}</Text>
        </View>
        <View style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Profile studio</Text>
          <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
          <TextInput defaultValue={profile.display_name || ''} onEndEditing={e => updateProfile({ display_name: e.nativeEvent.text })} placeholder="Display name" placeholderTextColor="#777" style={styles.field} maxLength={40} />
          <Text style={styles.fieldLabel}>BIO</Text>
          <TextInput defaultValue={profile.bio || ''} onEndEditing={e => updateProfile({ bio: e.nativeEvent.text })} placeholder="A little about you" placeholderTextColor="#777" style={styles.field} maxLength={120} />
          <Text style={styles.fieldLabel}>STATUS</Text>
          <TextInput defaultValue={profile.status_text || ''} onEndEditing={e => updateProfile({ status_text: e.nativeEvent.text })} placeholder="Set a short status" placeholderTextColor="#777" style={styles.field} maxLength={60} />
          <Text style={styles.fieldLabel}>PROFILE FRAME</Text>
          <View style={styles.frameRow}>{FRAMES.map(f => <Pressable key={f.id} onPress={() => updateProfile({ frame_id: f.id })} style={[styles.frameChoice, { borderColor: f.color, borderWidth: profile.frame_id === f.id ? 3 : 1 }]}><View style={[styles.frameDot, { backgroundColor: f.color }]} /><Text style={styles.frameLabel}>{f.label}</Text></Pressable>)}</View>
          <View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Animated profile ring</Text><Text style={styles.muted}>Subtle motion around your photo</Text></View><Switch value={!!profile.animated_pfp} onValueChange={v => updateProfile({ animated_pfp: v })} trackColor={{ false: '#383838', true: C.orange }} thumbColor="#fff" /></View>
          <View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Smart Lite mode</Text><Text style={styles.muted}>Reduce motion and media quality on slower phones</Text></View><Switch value={liteMode} onValueChange={setLiteMode} trackColor={{ false: '#383838', true: C.orange }} thumbColor="#fff" /></View>
          <Text style={styles.usernameInfo}>Your unique username: <Text style={{ color: C.orange, fontWeight: '800' }}>@{profile.username}</Text></Text>
        </View>
        <Action label="SIGN OUT" quiet onPress={logout} />
        <Text style={styles.footnote}>ORANGE keeps your account and chats on your Supabase project. Never share your password or verification code.</Text>
      </ScrollView>}

      <View style={styles.bottomNav}>
        {([['chats','◫','Chats'],['updates','◉','Instants'],['notes','✳','Notes'],['profile','◎','You']] as const).map(([id, icon, label]) =>
          <Pressable key={id} onPress={() => { ping(); setTab(id); }} style={styles.navItem}>
            <Text style={[styles.navIcon, tab === id && { color: C.orange }]}>{icon}</Text>
            <Text style={[styles.navLabel, tab === id && { color: C.orange }]}>{label}</Text>
          </Pressable>)}
      </View>

      <Modal visible={newChatOpen} transparent animationType="fade" onRequestClose={() => setNewChatOpen(false)}>
        <View style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.sectionTitle}>New private chat</Text><Text style={styles.muted}>Enter someone's unique ORANGE username.</Text><TextInput value={searchUsername} onChangeText={setSearchUsername} autoCapitalize="none" placeholder="@username" placeholderTextColor="#777" style={styles.field} /><Action label="OPEN CHAT" onPress={startDirect} /><Action label="CANCEL" quiet onPress={() => setNewChatOpen(false)} /></View></View>
      </Modal>
      <Modal visible={groupOpen} transparent animationType="fade" onRequestClose={() => setGroupOpen(false)}>
        <View style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.sectionTitle}>Create a group</Text><TextInput value={groupTitle} onChangeText={setGroupTitle} placeholder="Group name" placeholderTextColor="#777" style={styles.field} /><TextInput value={groupUsernames} onChangeText={setGroupUsernames} autoCapitalize="none" placeholder="user_one, user_two" placeholderTextColor="#777" style={styles.field} /><Text style={styles.footnote}>Add usernames separated by commas. You will be the group owner.</Text><Action label="CREATE GROUP" onPress={createGroup} /><Action label="CANCEL" quiet onPress={() => setGroupOpen(false)} /></View></View>
      </Modal>
      <Modal visible={!!storyOpen} transparent animationType="fade" onRequestClose={() => setStoryOpen(null)}>
        <View style={styles.storyModal}><Pressable onPress={() => setStoryOpen(null)} style={styles.storyClose}><Text style={{ color: '#fff', fontSize: 24 }}>×</Text></Pressable>{storyOpen?.media_url ? <Image source={{ uri: storyOpen.media_url }} style={styles.storyImage} resizeMode="contain" /> : null}<Text style={styles.storyCaption}>{storyOpen?.caption || ('@' + (storyOpen?.owner?.username || ''))}</Text></View>
      </Modal>
      <Modal visible={passwordRecovery} transparent animationType="fade" onRequestClose={() => setPasswordRecovery(false)}>
        <View style={styles.modalShade}><View style={styles.modalCard}>
          <Text style={styles.sectionTitle}>Choose a new password</Text>
          <Text style={styles.muted}>Use at least 8 characters to secure your account.</Text>
          <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="New password" placeholderTextColor="#777" style={styles.field} />
          <TextInput value={confirmNewPassword} onChangeText={setConfirmNewPassword} secureTextEntry placeholder="Confirm new password" placeholderTextColor="#777" style={styles.field} />
          <Action label={authBusy ? 'PLEASE WAIT…' : 'UPDATE PASSWORD'} onPress={saveNewPassword} />
          <Action label="CANCEL" quiet onPress={() => setPasswordRecovery(false)} />
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  muted: { color: C.muted, fontSize: 12 },
  authRoot: { flex: 1, backgroundColor: C.bg },
  authGlow: { flex: 1, paddingHorizontal: 22, justifyContent: 'center' },
  logoMark: { width: 54, height: 54, borderRadius: 18, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  logoMarkText: { color: '#17100A', fontSize: 34, fontWeight: '900' },
  brand: { color: C.white, fontSize: 30, fontWeight: '900', letterSpacing: 5, textAlign: 'center' },
  tagline: { color: C.muted, textAlign: 'center', marginTop: 8, marginBottom: 28, fontSize: 13 },
  authCard: { backgroundColor: '#14171D', borderColor: '#30343E', borderWidth: 1, borderRadius: 28, padding: 22, shadowColor: '#FF842B', shadowOpacity: 0.10, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  sectionTitle: { color: C.white, fontSize: 17, fontWeight: '800' },
  fieldLabel: { color: '#A5A09B', fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginTop: 16, marginBottom: 7 },
  field: { backgroundColor: '#0D1015', borderWidth: 1, borderColor: '#343A45', borderRadius: 15, paddingHorizontal: 15, paddingVertical: 14, color: C.white, fontSize: 14 },
  action: { backgroundColor: C.orange, paddingVertical: 15, paddingHorizontal: 18, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 17, minHeight: 50, shadowColor: C.orange, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  actionQuiet: { backgroundColor: '#252525', borderWidth: 1, borderColor: '#383838' },
  actionSmall: { minHeight: 36, paddingVertical: 9, paddingHorizontal: 13, marginTop: 0 },
  actionText: { color: '#17100A', fontWeight: '900', letterSpacing: 0.8, fontSize: 13 },
  footnote: { color: '#77716B', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 14 },
  topBar: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0B0D11' },
  topEyebrow: { color: C.muted, fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  topTitle: { color: C.white, fontSize: 25, fontWeight: '900', letterSpacing: 3 },
  topIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#191D25', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#303642' },
  topIconText: { color: C.orange, fontSize: 24, fontWeight: '500' },
  searchPill: { height: 48, borderRadius: 17, marginHorizontal: 18, backgroundColor: '#141820', borderWidth: 1, borderColor: '#2D333E', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 18 },
  searchInput: { flex: 1, color: C.white, fontSize: 13, paddingVertical: 0, paddingHorizontal: 10 },
  storiesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  orangeLink: { color: C.orange, fontSize: 12, fontWeight: '800' },
  storyStrip: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 18, gap: 14 },
  storyItem: { width: 68, alignItems: 'center' },
  addStoryCircle: { width: 62, height: 62, borderRadius: 31, borderWidth: 1.5, borderColor: C.orange, backgroundColor: '#1C1712', alignItems: 'center', justifyContent: 'center' },
  storyRing: { borderWidth: 2, borderColor: C.orange, borderRadius: 36, padding: 2 },
  storyName: { color: '#C8C4C0', fontSize: 10, marginTop: 6, maxWidth: 68 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 },
  chatRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 20, minHeight: 84, backgroundColor: '#0C0F14' },
  chatRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 2 },
  chatName: { color: C.white, fontSize: 14, fontWeight: '800' },
  chatTime: { color: C.muted, fontSize: 10 },
  chatPreview: { color: C.muted, fontSize: 12, marginTop: 5 },
  empty: { alignItems: 'center', paddingHorizontal: 35, paddingTop: 65 },
  emptyIcon: { color: C.orange, fontSize: 36, marginBottom: 10 },
  emptyTitle: { color: C.white, fontSize: 17, fontWeight: '800', marginBottom: 7 },
  bottomNav: { height: 70, borderTopWidth: 1, borderTopColor: '#282E38', backgroundColor: '#0B0D11', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: Platform.OS === 'android' ? 3 : 12 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  navIcon: { color: '#777', fontSize: 19, fontWeight: '700' },
  navLabel: { color: '#777', fontSize: 9, fontWeight: '700' },
  page: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 },
  pageHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { color: C.white, fontSize: 26, fontWeight: '900', marginBottom: 5 },
  updateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 12, borderRadius: 16, marginTop: 10 },
  noteComposer: { flexDirection: 'row', gap: 8, marginTop: 22, marginBottom: 18 },
  noteInput: { flex: 1, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 14, color: C.white, minHeight: 46 },
  notePost: { backgroundColor: C.orange, borderRadius: 13, paddingHorizontal: 16, justifyContent: 'center' },
  ownNote: { backgroundColor: '#28180D', borderColor: '#754018', borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  noteTag: { color: C.orange, fontSize: 9, letterSpacing: 1.6, fontWeight: '900', marginBottom: 8 },
  ownNoteText: { color: C.white, fontSize: 16, fontWeight: '700' },
  noteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 15, borderWidth: 1, borderColor: C.line, padding: 13, marginTop: 9 },
  noteText: { color: C.white, fontSize: 14, marginTop: 5, marginBottom: 5 },
  profileHero: { alignItems: 'center', paddingTop: 10, paddingBottom: 24 },
  editAvatar: { color: C.orange, fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  profileName: { color: C.white, fontSize: 23, fontWeight: '900', marginTop: 12 },
  profileHandle: { color: C.orange, fontSize: 13, marginTop: 3 },
  profileBio: { color: '#C7C2BD', marginTop: 12, textAlign: 'center', fontSize: 13 },
  profileMail: { color: C.muted, marginTop: 5, fontSize: 11 },
  settingsCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16, marginBottom: 14 },
  frameRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  frameChoice: { borderRadius: 12, backgroundColor: '#0D0D0D', padding: 9, minWidth: 65, alignItems: 'center' },
  frameDot: { width: 18, height: 18, borderRadius: 9, marginBottom: 5 },
  frameLabel: { color: C.white, fontSize: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line, marginTop: 17, paddingTop: 15 },
  settingTitle: { color: C.white, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  usernameInfo: { color: C.muted, fontSize: 12, marginTop: 18 },
  chatHeader: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line, gap: 8 },
  back: { width: 34, height: 44, justifyContent: 'center' },
  backText: { color: C.orange, fontSize: 36, lineHeight: 40 },
  chatHeaderName: { color: C.white, fontSize: 15, fontWeight: '800' },
  chatHeaderSub: { color: C.muted, fontSize: 10, marginTop: 3 },
  headerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  headerIconText: { color: C.white, fontSize: 22 },
  groupAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#25180E', alignItems: 'center', justifyContent: 'center' },
  groupAvatarLarge: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#25180E', alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 14, paddingVertical: 16, flexGrow: 1, justifyContent: 'flex-end' },
  messageRow: { flexDirection: 'row', marginVertical: 4 },
  messageBubble: { maxWidth: '82%', borderRadius: 17, paddingHorizontal: 12, paddingVertical: 9 },
  myBubble: { backgroundColor: C.orange, borderBottomRightRadius: 5 },
  theirBubble: { backgroundColor: '#202020', borderWidth: 1, borderColor: '#303030', borderBottomLeftRadius: 5 },
  messageText: { color: C.white, fontSize: 14, lineHeight: 20 },
  messageTime: { color: '#777', fontSize: 9, alignSelf: 'flex-end', marginTop: 4 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  reactionModal: { backgroundColor: '#171B22', borderRadius: 25, padding: 22, borderWidth: 1, borderColor: '#343B47' },
  reactionPicker: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9, marginTop: 18 },
  reactionOption: { width: 54, height: 54, borderRadius: 17, backgroundColor: '#252B35', alignItems: 'center', justifyContent: 'center' },
  deleteMessage: { marginTop: 18, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16, alignItems: 'center' },
  reactionChip: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#2B2F38', borderWidth: 1, borderColor: '#414854' },
  reactionChipActive: { backgroundColor: '#4A2C1B', borderColor: C.orange },
  reactionText: { color: C.white, fontSize: 10, fontWeight: '700' },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 175 },
  wave: { paddingVertical: 2 },
  messagePhoto: { width: 210, height: 190, borderRadius: 12, backgroundColor: '#282828' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1, borderTopColor: '#2A303A', backgroundColor: '#0C0F14', gap: 7 },
  composerIcon: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  composerIconText: { color: C.orange, fontSize: 23 },
  composerInput: { flex: 1, maxHeight: 100, minHeight: 42, backgroundColor: C.panel2, borderRadius: 15, color: C.white, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 8, fontSize: 14 },
  micButton: { width: 40, height: 42, borderRadius: 14, backgroundColor: '#E9A45D', alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
  stickerTray: { flexDirection: 'row', flexWrap: 'wrap', padding: 9, backgroundColor: C.panel, borderTopWidth: 1, borderColor: C.line, justifyContent: 'space-around' },
  sticker: { width: '12%', alignItems: 'center', paddingVertical: 5 },
  recordingBar: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, backgroundColor: '#21140D' },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  modalShade: { flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: '#171B22', borderRadius: 25, padding: 22, borderWidth: 1, borderColor: '#343B47' },
  storyModal: { flex: 1, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', padding: 20 },
  storyClose: { position: 'absolute', top: 45, right: 24, zIndex: 2 },
  storyImage: { width: '100%', height: '78%' },
  storyCaption: { color: C.white, fontSize: 14, marginTop: 18 }
});