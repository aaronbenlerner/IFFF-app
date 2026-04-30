import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View className="flex-1 bg-black p-6 pt-20">
        <Text className="text-amber-500 text-xs font-bold tracking-widest uppercase mb-2">
          Something broke
        </Text>
        <Text className="text-white text-2xl font-black mb-4">
          The app hit an error
        </Text>
        <Text className="text-zinc-400 text-sm mb-2">
          Tap reset to try again. Your saved data is safe.
        </Text>
        <ScrollView className="bg-zinc-950 border border-zinc-800 rounded-md p-3 max-h-72 my-4">
          <Text className="text-red-400 text-[11px] font-mono">
            {this.state.error.message}
          </Text>
          {this.state.error.stack ? (
            <Text className="text-zinc-500 text-[10px] font-mono mt-2">
              {this.state.error.stack}
            </Text>
          ) : null}
        </ScrollView>
        <Pressable
          onPress={this.reset}
          className="bg-amber-500 py-4 rounded-md items-center"
        >
          <Text className="text-black font-black tracking-widest uppercase text-sm">
            Reset
          </Text>
        </Pressable>
      </View>
    );
  }
}
