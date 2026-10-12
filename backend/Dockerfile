FROM eclipse-temurin:21-jdk AS build
WORKDIR /source
COPY . .
RUN --mount=type=cache,target=/root/.gradle chmod +x gradlew && ./gradlew --no-daemon bootJar -x test
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /source/build/libs/*.jar app.jar
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0"
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
