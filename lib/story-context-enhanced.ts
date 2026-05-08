     1|/**
     2| * Enhanced story context functions for editing and updating stories
     3| * These functions extend the base story context with editing capabilities
     4| */
     5|
     6|import AsyncStorage from '@react-native-async-storage/async-storage';
     7|import { Story, StoryScene, Choice } from './types';
     8|import { STORAGE_KEYS } from './storage-keys';
     9|
    10|export async function updateStory(story: Story): Promise<void> {
    11|  try {
    12|    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    13|    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    14|    
    15|    const index = stories.findIndex((s: Story) => s.id === story.id);
    16|    if (index >= 0) {
    17|      stories[index] = { ...story, updatedAt: Date.now() };
    18|    } else {
    19|      stories.push({ ...story, updatedAt: Date.now() });
    20|    }
    21|    
    22|    await AsyncStorage.setItem(STORAGE_KEYS.STORIES,  JSON.stringify(stories));
    23|  } catch (error) {
    24|    console.error('Failed to update story:', error);
    25|    throw error;
    26|  }
    27|}
    28|
    29|export async function updateScene(storyId: string, scene: StoryScene): Promise<void> {
    30|  try {
    31|    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    32|    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    33|
    34|    const story = stories.find((s: Story) => s.id === storyId);
    35|    if (!story) {
    36|      throw new Error(`Story with id ${storyId} not found`);
    37|    }
    38|
    39|    story.scenes[scene.id] = scene;
    40|    story.updatedAt = Date.now();
    41|    await AsyncStorage.setItem(STORAGE_KEYS.STORIES,  JSON.stringify(stories));
    42|  } catch (error) {
    43|    console.error('Failed to update scene:', error);
    44|    throw error;
    45|  }
    46|}
    47|
    48|export async function addScene(storyId: string, scene: StoryScene): Promise<void> {
    49|  try {
    50|    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    51|    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    52|
    53|    const story = stories.find((s: Story) => s.id === storyId);
    54|    if (!story) {
    55|      throw new Error(`Story with id ${storyId} not found`);
    56|    }
    57|
    58|    story.scenes[scene.id] = scene;
    59|    story.updatedAt = Date.now();
    60|    await AsyncStorage.setItem(STORAGE_KEYS.STORIES,  JSON.stringify(stories));
    61|  } catch (error) {
    62|    console.error('Failed to add scene:', error);
    63|    throw error;
    64|  }
    65|}
    66|
    67|export async function deleteScene(storyId: string, sceneId: string): Promise<void> {
    68|  try {
    69|    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    70|    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    71|
    72|    const story = stories.find((s: Story) => s.id === storyId);
    73|    if (!story) {
    74|      throw new Error(`Story with id ${storyId} not found`);
    75|    }
    76|
    77|    if (!story.scenes[sceneId]) {
    78|      throw new Error(`Scene with id ${sceneId} not found in story ${storyId}`);
    79|    }
    80|
    81|    delete story.scenes[sceneId];
    82|    story.updatedAt = Date.now();
    83|    await AsyncStorage.setItem(STORAGE_KEYS.STORIES,  JSON.stringify(stories));
    84|  } catch (error) {
    85|    console.error('Failed to delete scene:', error);
    86|    throw error;
    87|  }
    88|}
    89|
    90|export async function addChoice(storyId: string, sceneId: string, choice: Choice): Promise<void> {
    91|  try {
    92|    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    93|    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    94|
    95|    const story = stories.find((s: Story) => s.id === storyId);
    96|    if (!story) {
    97|      throw new Error(`Story with id ${storyId} not found`);
    98|    }
    99|
   100|    if (!story.scenes[sceneId]) {
   101|      throw new Error(`Scene with id ${sceneId} not found in story ${storyId}`);
   102|    }
   103|
   104|    story.scenes[sceneId].choices.push(choice);
   105|    story.updatedAt = Date.now();
   106|    await AsyncStorage.setItem(STORAGE_KEYS.STORIES,  JSON.stringify(stories));
   107|  } catch (error) {
   108|    console.error('Failed to add choice:', error);
   109|    throw error;
   110|  }
   111|}
   112|
   113|export async function deleteChoice(storyId: string, sceneId: string, choiceId: string): Promise<void> {
   114|  try {
   115|    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
   116|    const stories = storiesJson ? JSON.parse(storiesJson) : [];
   117|
   118|    const story = stories.find((s: Story) => s.id === storyId);
   119|    if (!story) {
   120|      throw new Error(`Story with id ${storyId} not found`);
   121|    }
   122|
   123|    if (!story.scenes[sceneId]) {
   124|      throw new Error(`Scene with id ${sceneId} not found in story ${storyId}`);
   125|    }
   126|
   127|    story.scenes[sceneId].choices = story.scenes[sceneId].choices.filter(
   128|      (c: Choice) => c.id !== choiceId
   129|    );
   130|    story.updatedAt = Date.now();
   131|    await AsyncStorage.setItem(STORAGE_KEYS.STORIES,  JSON.stringify(stories));
   132|  } catch (error) {
   133|    console.error('Failed to delete choice:', error);
   134|    throw error;
   135|  }
   136|}
   137|
   138|export async function exportStory(storyId: string): Promise<string> {
   139|  try {
   140|    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
   141|    const stories = storiesJson ? JSON.parse(storiesJson) : [];
   142|    
   143|    const story = stories.find((s: Story) => s.id === storyId);
   144|    if (story) {
   145|      return JSON.stringify(story, null, 2);
   146|    }
   147|    throw new Error('Story not found');
   148|  } catch (error) {
   149|    console.error('Failed to export story:', error);
   150|    throw error;
   151|  }
   152|}
   153|
   154|export async function importStory(storyJson: string): Promise<Story> {
   155|  try {
   156|    const story = JSON.parse(storyJson) as Story;
   157|    
   158|    // Validate story structure
   159|    if (!story.id || !story.title || !story.startSceneId || !story.scenes) {
   160|      throw new Error('Invalid story structure');
   161|    }
   162|    
   163|    // Generate new ID to avoid conflicts
   164|    story.id = `story-${Date.now()}`;
   165|    story.createdAt = Date.now();
   166|    story.updatedAt = Date.now();
   167|    
   168|    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
   169|    const stories = storiesJson ? JSON.parse(storiesJson) : [];
   170|    stories.push(story);
   171|    
   172|    await AsyncStorage.setItem(STORAGE_KEYS.STORIES,  JSON.stringify(stories));
   173|    return story;
   174|  } catch (error) {
   175|    console.error('Failed to import story:', error);
   176|    throw error;
   177|  }
   178|}
   179|