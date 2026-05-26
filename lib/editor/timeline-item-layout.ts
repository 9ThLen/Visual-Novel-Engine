export function getTimelineItemLayout(index: number) {
  return {
    containerStyle: {
      paddingBottom: 6,
    },
    connectorStyle: {
      height: index > 0 ? 16 : 0,
    },
    cardStyle: {
      marginHorizontal: 8,
      marginVertical: 0,
    },
  } as const;
}
