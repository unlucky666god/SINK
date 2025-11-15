// WebRTC Call Management
let localStream = null;
let screenStream = null;
let peerConnections = new Map(); // userId -> RTCPeerConnection
let currentCall = null;
let isMuted = false;
let isDeafened = false;
let isSharingScreen = false;

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Initialize call functionality
function initCallHandlers() {
  if (!socket) return;

  // Incoming call
  socket.on('incoming_call', (data) => {
    showIncomingCallNotification(data);
  });

  // Call accepted
  socket.on('call_accepted', async (data) => {
    console.log('Call accepted by:', data.userId);
    
    // Clear timeout since someone answered
    if (currentCall && currentCall.timeout) {
      clearTimeout(currentCall.timeout);
      currentCall.timeout = null;
    }
    
    // If we don't have a call yet (we're the one being called), start it
    if (!currentCall || !localStream) {
      await startCall(data.callId, data.participants, data.isGroup);
    } else {
      // We're already in the call, just create peer connection with new user
      await createPeerConnection(data.userId);
    }
  });

  // Call declined
  socket.on('call_declined', (data) => {
    console.log('Call declined by:', data.userId);
    alert(`${data.userName} declined the call`);
    
    // If we're the caller and no one is in the call, end it
    if (currentCall && peerConnections.size === 0) {
      endCall();
    }
  });

  // User joined call
  socket.on('user_joined_call', async (data) => {
    console.log('User joined call:', data.userId);
    await createPeerConnection(data.userId);
  });

  // User left call
  socket.on('user_left_call', (data) => {
    console.log('User left call:', data.userId);
    removePeerConnection(data.userId);
  });

  // WebRTC signaling
  socket.on('webrtc_offer', async (data) => {
    await handleOffer(data);
  });

  socket.on('webrtc_answer', async (data) => {
    await handleAnswer(data);
  });

  socket.on('webrtc_ice_candidate', async (data) => {
    await handleIceCandidate(data);
  });

  // Call ended
  socket.on('call_ended', () => {
    endCall();
  });
}

// Show incoming call notification
function showIncomingCallNotification(data) {
  const notification = document.getElementById('incoming-call-notification');
  const callerName = document.getElementById('caller-name');
  
  if (notification && callerName) {
    callerName.textContent = data.callerName || data.groupName;
    notification.style.display = 'block';
    
    currentCall = {
      callId: data.callId,
      isGroup: data.isGroup,
      participants: data.participants
    };
  }
}

// Hide incoming call notification
function hideIncomingCallNotification() {
  const notification = document.getElementById('incoming-call-notification');
  if (notification) {
    notification.style.display = 'none';
  }
}

// Accept call
async function acceptCall() {
  if (!currentCall) return;
  
  hideIncomingCallNotification();
  
  socket.emit('accept_call', {
    callId: currentCall.callId,
    participants: currentCall.participants,
    isGroup: currentCall.isGroup
  });
  
  await startCall(currentCall.callId, currentCall.participants, currentCall.isGroup);
}

// Decline call
function declineCall() {
  if (!currentCall) return;
  
  socket.emit('decline_call', {
    callId: currentCall.callId
  });
  
  hideIncomingCallNotification();
  currentCall = null;
}

// Start a call
async function startCall(callId, participants, isGroup, isInitiator = false) {
  try {
    // Try to get video and audio, fallback to audio only if no camera
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
    } catch (videoError) {
      console.warn('Camera not available, using audio only:', videoError);
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
      } catch (audioError) {
        console.error('Failed to access audio:', audioError);
        alert('Failed to access microphone. Please check your browser permissions.');
        return;
      }
    }
    
    // Show call interface
    const callInterface = document.getElementById('call-interface');
    const callParticipantName = document.getElementById('call-participant-name');
    const callParticipants = document.getElementById('call-participants');
    
    if (callInterface) {
      callInterface.style.display = 'flex';
      
      if (callParticipantName) {
        if (isGroup && currentGroup) {
          callParticipantName.textContent = currentGroup.name;
        } else if (currentChatUser) {
          callParticipantName.textContent = currentChatUser.name;
        }
      }
      
      // Add own video/audio
      addParticipantVideo(window.user.id, localStream, true);
      
      // Only create peer connections if we're accepting a call (not initiating)
      // When initiating, connections will be created when others accept
      if (!isInitiator) {
        for (const userId of participants) {
          if (userId !== window.user.id) {
            await createPeerConnection(userId);
          }
        }
      }
    }
    
    currentCall = { callId, participants, isGroup };
  } catch (error) {
    console.error('Error starting call:', error);
    alert('Failed to access microphone. Please check your browser permissions.');
    endCall();
  }
}

// Create WebRTC peer connection
async function createPeerConnection(userId) {
  const pc = new RTCPeerConnection(configuration);
  peerConnections.set(userId, pc);
  
  // Add local stream tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  // Handle incoming tracks
  pc.ontrack = (event) => {
    console.log('Received track from:', userId);
    addParticipantVideo(userId, event.streams[0], false);
  };
  
  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc_ice_candidate', {
        to: userId,
        candidate: event.candidate
      });
    }
  };
  
  // Create and send offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  socket.emit('webrtc_offer', {
    to: userId,
    offer: offer
  });
}

// Handle WebRTC offer
async function handleOffer(data) {
  const pc = new RTCPeerConnection(configuration);
  peerConnections.set(data.from, pc);
  
  // Add local stream tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  // Handle incoming tracks
  pc.ontrack = (event) => {
    console.log('Received track from:', data.from);
    addParticipantVideo(data.from, event.streams[0], false);
  };
  
  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc_ice_candidate', {
        to: data.from,
        candidate: event.candidate
      });
    }
  };
  
  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  
  socket.emit('webrtc_answer', {
    to: data.from,
    answer: answer
  });
}

// Handle WebRTC answer
async function handleAnswer(data) {
  const pc = peerConnections.get(data.from);
  if (pc && pc.signalingState !== 'stable') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
}

// Handle ICE candidate
async function handleIceCandidate(data) {
  const pc = peerConnections.get(data.from);
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

// Add participant video to UI
function addParticipantVideo(userId, stream, isLocal) {
  const callParticipants = document.getElementById('call-participants');
  if (!callParticipants) return;
  
  // Remove existing card if any
  const existingCard = document.getElementById(`participant-${userId}`);
  if (existingCard) {
    existingCard.remove();
  }
  
  const card = document.createElement('div');
  card.className = 'participant-card';
  card.id = `participant-${userId}`;
  
  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  if (isLocal) {
    video.muted = true;
  }
  
  const info = document.createElement('div');
  info.className = 'participant-info';
  
  let userName = 'User ' + userId;
  if (userId === window.user.id) {
    userName = 'You';
  } else if (window.user.friends) {
    const friend = window.user.friends.find(f => f.id === userId);
    if (friend) userName = friend.name;
  }
  info.textContent = userName;
  
  const controls = document.createElement('div');
  controls.className = 'participant-controls';
  
  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.className = 'participant-control-btn';
  fullscreenBtn.innerHTML = '<img src="/static/imgs/fullscreen.svg" alt="fullscreen">';
  fullscreenBtn.onclick = () => toggleFullscreen(card);
  
  controls.appendChild(fullscreenBtn);
  
  card.appendChild(video);
  card.appendChild(info);
  card.appendChild(controls);
  
  callParticipants.appendChild(card);
}

// Remove participant connection
function removePeerConnection(userId) {
  const pc = peerConnections.get(userId);
  if (pc) {
    pc.close();
    peerConnections.delete(userId);
  }
  
  const card = document.getElementById(`participant-${userId}`);
  if (card) {
    card.remove();
  }
}

// Toggle fullscreen for video
function toggleFullscreen(card) {
  if (card.classList.contains('fullscreen')) {
    card.classList.remove('fullscreen');
    const img = card.querySelector('.participant-control-btn img');
    if (img) img.src = '/static/imgs/fullscreen.svg';
  } else {
    // Remove fullscreen from all other cards
    document.querySelectorAll('.participant-card.fullscreen').forEach(c => {
      c.classList.remove('fullscreen');
    });
    card.classList.add('fullscreen');
    const img = card.querySelector('.participant-control-btn img');
    if (img) img.src = '/static/imgs/fullscreenExit.svg';
  }
}

// Toggle microphone
function toggleMicrophone() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isMuted = !audioTrack.enabled;
    
    updateMicButton();
  }
}

// Update microphone button state
function updateMicButton() {
  const btn = document.getElementById('toggle-mic-btn');
  const cpMicBtn = document.querySelector('.user-place .micro');
  
  if (btn) {
    btn.querySelector('img').src = isMuted ? '/static/imgs/micOff.svg' : '/static/imgs/mic.svg';
  }
  
  if (cpMicBtn) {
    cpMicBtn.querySelector('img').src = isMuted ? '/static/imgs/micOff.svg' : '/static/imgs/mic.svg';
  }
}

// Toggle audio (deafen)
function toggleAudio() {
  isDeafened = !isDeafened;
  
  if (isDeafened) {
    // Mute all remote audio
    document.querySelectorAll('.participant-card video').forEach(video => {
      const videoElement = video;
      if (videoElement.parentElement && !videoElement.parentElement.id.includes(`participant-${window.user.id}`)) {
        videoElement.muted = true;
      }
    });
    
    // Also mute mic when deafened
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        isMuted = true;
      }
    }
  } else {
    // Unmute all remote audio
    document.querySelectorAll('.participant-card video').forEach(video => {
      const videoElement = video;
      if (videoElement.parentElement && !videoElement.parentElement.id.includes(`participant-${window.user.id}`)) {
        videoElement.muted = false;
      }
    });
  }
  
  updateAudioButton();
  updateMicButton();
}

// Update audio button state
function updateAudioButton() {
  const btn = document.getElementById('toggle-audio-btn');
  const cpHeadphonesBtn = document.querySelector('.user-place .headphones');
  
  if (btn) {
    btn.querySelector('img').src = isDeafened ? '/static/imgs/headphonesOff.svg' : '/static/imgs/headphones.svg';
  }
  
  if (cpHeadphonesBtn) {
    cpHeadphonesBtn.querySelector('img').src = isDeafened ? '/static/imgs/headphonesOff.svg' : '/static/imgs/headphones.svg';
  }
}

// Toggle screen sharing
async function toggleScreenShare() {
  if (!isSharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true  // Include system audio
      });
      
      // Replace video track in all peer connections
      const videoTrack = screenStream.getVideoTracks()[0];
      peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });
      
      // Add audio track if available
      const audioTracks = screenStream.getAudioTracks();
      if (audioTracks.length > 0) {
        peerConnections.forEach((pc) => {
          pc.addTrack(audioTracks[0], screenStream);
        });
      }
      
      // Update own video
      const ownVideo = document.querySelector(`#participant-${window.user.id} video`);
      if (ownVideo) {
        ownVideo.srcObject = screenStream;
      }
      
      isSharingScreen = true;
      
      const btn = document.getElementById('toggle-screen-btn');
      if (btn) {
        btn.querySelector('img').src = '/static/imgs/shareScreenOff.svg';
      }
      
      // Handle screen share stop
      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Error sharing screen:', error);
    }
  } else {
    stopScreenShare();
  }
}

// Stop screen sharing
function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  
  // Restore camera video
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    peerConnections.forEach((pc) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
    });
    
    // Update own video
    const ownVideo = document.querySelector(`#participant-${window.user.id} video`);
    if (ownVideo) {
      ownVideo.srcObject = localStream;
    }
  }
  
  isSharingScreen = false;
  
  const btn = document.getElementById('toggle-screen-btn');
  if (btn) {
    btn.classList.remove('active');
    btn.querySelector('img').src = '/static/imgs/shareScreen.svg';
  }
}

// End call
function endCall() {
  // Clear timeout if exists
  if (currentCall && currentCall.timeout) {
    clearTimeout(currentCall.timeout);
  }
  
  // Stop all streams
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  
  // Close all peer connections
  peerConnections.forEach((pc) => {
    pc.close();
  });
  peerConnections.clear();
  
  // Notify server
  if (currentCall && socket) {
    socket.emit('end_call', {
      callId: currentCall.callId
    });
  }
  
  // Hide call interface
  const callInterface = document.getElementById('call-interface');
  if (callInterface) {
    callInterface.style.display = 'none';
  }
  
  // Clear participants
  const callParticipants = document.getElementById('call-participants');
  if (callParticipants) {
    callParticipants.innerHTML = '';
  }
  
  // Reset states
  currentCall = null;
  isMuted = false;
  isDeafened = false;
  isSharingScreen = false;
}

// Initiate call (can be called from UI)
async function initiateCall(userId, isGroup = false) {
  const callId = Date.now().toString();
  
  // Determine participants
  let participants = [];
  if (isGroup) {
    participants = currentGroup ? [...currentGroup.users] : [];
  } else {
    participants = [window.user.id, userId];
  }
  
  // Start call UI immediately for caller (as initiator)
  await startCall(callId, participants, isGroup, true);
  
  // Send call notification to other participants
  socket.emit('initiate_call', {
    callId,
    to: userId,
    isGroup
  });
  
  // Set timeout for no answer (30 seconds)
  const callTimeout = setTimeout(() => {
    if (currentCall && currentCall.callId === callId) {
      // Check if anyone joined (besides the caller)
      if (peerConnections.size === 0) {
        alert('No one answered the call');
        endCall();
      }
    }
  }, 30000);
  
  // Store timeout to clear it if someone answers
  if (currentCall) {
    currentCall.timeout = callTimeout;
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Accept call button
  const acceptBtn = document.getElementById('accept-call-btn');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', acceptCall);
  }
  
  // Decline call button
  const declineBtn = document.getElementById('decline-call-btn');
  if (declineBtn) {
    declineBtn.addEventListener('click', declineCall);
  }
  
  // Toggle microphone (call interface button)
  const toggleMicBtn = document.getElementById('toggle-mic-btn');
  if (toggleMicBtn) {
    toggleMicBtn.addEventListener('click', toggleMicrophone);
  }
  
  // Toggle microphone (control panel button)
  const cpMicBtn = document.querySelector('.user-place .micro');
  if (cpMicBtn) {
    cpMicBtn.addEventListener('click', toggleMicrophone);
  }
  
  // Toggle audio (call interface button)
  const toggleAudioBtn = document.getElementById('toggle-audio-btn');
  if (toggleAudioBtn) {
    toggleAudioBtn.addEventListener('click', toggleAudio);
  }
  
  // Toggle audio (control panel button)
  const cpHeadphonesBtn = document.querySelector('.user-place .headphones');
  if (cpHeadphonesBtn) {
    cpHeadphonesBtn.addEventListener('click', toggleAudio);
  }
  
  // Toggle screen share
  const toggleScreenBtn = document.getElementById('toggle-screen-btn');
  if (toggleScreenBtn) {
    toggleScreenBtn.addEventListener('click', toggleScreenShare);
  }
  
  // End call
  const endCallBtn = document.getElementById('end-call-btn');
  if (endCallBtn) {
    endCallBtn.addEventListener('click', endCall);
  }
});