import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
  Platform,
} from 'react-native';

const { width, height } = Dimensions.get('window');

export function CustomSplashScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Logo fade in and scale up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Gradient background effect using overlapping views */}
      <View style={styles.gradientTop} />
      <View style={styles.gradientBottom} />

      {/* Glow effect behind logo */}
      <View style={styles.glowOuter} />
      <View style={styles.glowInner} />

      {/* Animated logo container */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [
              { scale: Animated.multiply(scaleAnim, pulseAnim) },
            ],
          },
        ]}
      >
        <View style={styles.logoCircle}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </Animated.View>

      {/* App name */}
      <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
        <Text style={styles.title}>DFlix</Text>
        <Text style={styles.subtitle}>Downloader</Text>
      </Animated.View>

      {/* Loading dots */}
      <Animated.View style={[styles.loadingContainer, { opacity: fadeAnim }]}>
        <View style={styles.dotsContainer}>
          {[0, 1, 2].map((i) => (
            <LoadingDot key={i} delay={i * 200} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function LoadingDot({ delay }: { delay: number }) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(animValue, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(animValue, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const translateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -12],
  });

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          transform: [{ translateY }],
          opacity: animValue.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          }),
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientTop: {
    position: 'absolute',
    top: -height * 0.3,
    left: -width * 0.3,
    width: width * 1.5,
    height: height * 0.6,
    backgroundColor: '#3d7fff',
    opacity: 0.08,
    borderRadius: 9999,
  },
  gradientBottom: {
    position: 'absolute',
    bottom: -height * 0.3,
    right: -width * 0.3,
    width: width * 1.5,
    height: height * 0.6,
    backgroundColor: '#00E5FF',
    opacity: 0.06,
    borderRadius: 9999,
  },
  glowOuter: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#3d7fff',
    opacity: 0.1,
  },
  glowInner: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#00E5FF',
    opacity: 0.12,
  },
  logoContainer: {
    marginBottom: 32,
  },
  logoCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 12px 40px rgba(61, 127, 255, 0.25)' as any,
      },
      android: {
        elevation: 12,
      },
      ios: {
        shadowColor: '#3d7fff',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
    }),
  },
  logo: {
    width: 100,
    height: 100,
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  title: {
    fontSize: 38,
    fontWeight: '800',
    color: '#1a1a2e',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3d7fff',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: height * 0.15,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3d7fff',
  },
});
